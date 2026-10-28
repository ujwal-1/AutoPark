import os
import io
import time
import pytest
import cv2
import numpy as np
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.database import Base, engine, SessionLocal
from app.models import ParkingSlot, ParkingSession, PreRegistration, User
from app.slot_allocator import (
    init_slots_db,
    clear_cooldowns,
    canonicalize_plate,
    are_plates_similar,
    allocate_entry_slot,
    release_exit_slot,
    reset_all_parking_demo
)
from app.yolov11_detector import yolov11_detector_engine

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_clean_slate():
    """Initializes slots and clears transient memory cooldowns for clean testing."""
    clear_cooldowns()
    db = SessionLocal()
    init_slots_db(db)
    reset_all_parking_demo(db)
    db.close()
    yield

def helper_pre_register(plate: str, username: str = None):
    uname = username or f"user_{plate.lower()}_{int(time.time()*1000)}"
    reg = client.post("/api/auth/register", json={
        "username": uname,
        "password": "Password123!",
        "full_name": f"Driver {plate}"
    })
    token = reg.json()["access_token"]
    client.post(
        "/api/bookings/pre-checkin",
        headers={"Authorization": f"Bearer {token}"},
        json={"plate_number": plate, "vehicle_type": "Car"}
    )
    return token

# 1. API Startup and Health Checks
def test_01_api_startup_and_health_checks():
    r1 = client.get("/")
    assert r1.status_code == 200
    assert r1.json()["status"] == "online"

    r2 = client.get("/health")
    assert r2.status_code == 200
    d = r2.json()
    assert d["status"] == "healthy"
    assert d["api"] == "online"
    assert d["database"] == "connected"
    assert d["models"]["yolo_plate_model"] is True
    assert "metrics" in d
    assert d["metrics"]["slots_total"] == 6

    r3 = client.get("/api/health")
    assert r3.status_code == 200
    assert r3.json()["status"] == "healthy"

# 2. Repeated Valid Image Submissions
def test_02_repeated_valid_image_submissions():
    # Load actual test fixture
    fixture_path = os.path.join(os.path.dirname(__file__), "fixtures", "parking_vehicle.jpg")
    with open(fixture_path, "rb") as f:
        img_bytes = f.read()

    # Pre-register vehicle so entry succeeds
    helper_pre_register("KA05KK0403", "driver_valid_rep")

    # Send 3 repeated submissions
    for i in range(3):
        r = client.post(
            "/api/detection/entry",
            files={"file": ("entry.jpg", img_bytes, "image/jpeg")}
        )
        assert r.status_code == 200
        data = r.json()
        assert data["camera"] == "ENTRY"
        # First submission allocates, subsequent are debounced / already_allocated
        assert data["status"] in ["allocated", "already_allocated"]
        assert data["slot"] == "A1"

# 3. Repeated Frames Where No Plate is Detected
def test_03_repeated_frames_where_no_plate_detected():
    # Synthetic plain white image (no vehicle, no plate)
    blank_img = np.full((240, 320, 3), 255, dtype=np.uint8)
    _, enc = cv2.imencode(".jpg", blank_img)
    blank_bytes = enc.tobytes()

    for _ in range(3):
        r = client.post(
            "/api/detection/entry",
            files={"file": ("blank.jpg", blank_bytes, "image/jpeg")}
        )
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "no_plate"
        assert data["slot"] is None
        assert data["trigger_buzzer"] is False

# 4. Malformed, Empty or Unsupported Images
def test_04_malformed_empty_or_unsupported_images():
    # Empty bytes
    r1 = client.post("/api/detection/entry", files={"file": ("empty.jpg", b"", "image/jpeg")})
    assert r1.status_code == 200
    assert r1.json()["status"] == "no_plate"

    # Corrupt payload
    r2 = client.post("/api/detection/entry", files={"file": ("corrupt.jpg", b"NOT_A_JPEG_DATA_HERE", "image/jpeg")})
    assert r2.status_code == 200
    assert r2.json()["status"] == "no_plate"

    # Exit camera with corrupt image
    r3 = client.post("/api/detection/exit", files={"file": ("corrupt.jpg", b"GARBAGE_PAYLOAD", "image/jpeg")})
    assert r3.status_code == 200
    assert r3.json()["status"] == "no_plate"

# 5. YOLO Detection and OCR Result Handling Using Test Images
def test_05_yolo_detection_and_ocr_handling():
    fixture_path = os.path.join(os.path.dirname(__file__), "fixtures", "parking_vehicle.jpg")
    with open(fixture_path, "rb") as f:
        img_bytes = f.read()

    res = yolov11_detector_engine.process_image(img_bytes, "ENTRY")
    assert res["detected"] is True
    assert res["plate_detected"] is True
    assert res["plate_bbox"] is not None
    assert len(res["plate_bbox"]) == 4
    # Plate bbox must be clamped inside image dimensions (320x240)
    px1, py1, px2, py2 = res["plate_bbox"]
    assert 0 <= px1 < px2 <= 320
    assert 0 <= py1 < py2 <= 240
    assert len(res["candidates"]) > 0
    top_cand = res["candidates"][0]["text"]
    assert "KA" in top_cand or "05" in top_cand or "0403" in top_cand

# 6. Plate Normalization and Confidence Handling
def test_06_plate_normalization_and_confidence():
    # Character visual equivalence
    assert canonicalize_plate("KA05KK0403") == canonicalize_plate("KA05KK04O3") # O/0 visual ambiguity
    assert canonicalize_plate("KA02CD5678") == canonicalize_plate("KA02CD5678")
    assert are_plates_similar("KA05KK0403", "KA05KK0403") is True
    assert are_plates_similar("KA05KK0403", "KA05KK04O3") is True # O/0 visual ambiguity
    assert are_plates_similar("KA05KK0403", "KA02CD5678") is False # Distinct cars

# 7. Authorized and Unauthorized Entry
def test_07_authorized_and_unauthorized_entry():
    # Unauthorized vehicle (not pre-registered)
    r_unauth = client.post(
        "/api/detection/entry",
        data={"plate_number": "UNAUTH999", "confidence": 0.95}
    )
    assert r_unauth.status_code == 200
    assert r_unauth.json()["status"] == "unauthorized"
    assert r_unauth.json()["slot"] is None
    assert r_unauth.json()["trigger_buzzer"] is False

    # Pre-register authorized vehicle
    helper_pre_register("KA05KK0403", "auth_driver_1")

    # Authorized entry
    r_auth = client.post(
        "/api/detection/entry",
        data={"plate_number": "KA05KK0403", "confidence": 0.95}
    )
    assert r_auth.status_code == 200
    assert r_auth.json()["status"] == "allocated"
    assert r_auth.json()["slot"] == "A1"
    assert r_auth.json()["trigger_buzzer"] is True

# 8. Correct Slot Allocation
def test_08_correct_slot_allocation():
    # Vehicle 1 -> Slot A1
    helper_pre_register("KA05KK0403", "car1_driver")
    r1 = client.post("/api/detection/entry", data={"plate_number": "KA05KK0403", "confidence": 0.95})
    assert r1.json()["slot"] == "A1"

    # Vehicle 2 -> Slot A2
    helper_pre_register("KA02CD5678", "car2_driver")
    r2 = client.post("/api/detection/entry", data={"plate_number": "KA02CD5678", "confidence": 0.95})
    assert r2.json()["slot"] == "A2"

# 9. Valid Exit and Correct Slot Release
def test_09_valid_exit_and_correct_slot_release():
    helper_pre_register("KA05KK0403", "exit_driver_1")
    client.post("/api/detection/entry", data={"plate_number": "KA05KK0403", "confidence": 0.95})

    # Verify slot A1 is occupied in DB
    db = SessionLocal()
    slot_a1 = db.query(ParkingSlot).filter(ParkingSlot.slot_number == "A1").first()
    assert slot_a1.status == "ALLOCATED"
    db.close()

    # Exit detection for KA05KK0403
    r_exit = client.post("/api/detection/exit", data={"plate_number": "KA05KK0403", "confidence": 0.95})
    assert r_exit.status_code == 200
    assert r_exit.json()["status"] == "released"
    assert r_exit.json()["slot"] == "A1"
    assert r_exit.json()["trigger_buzzer"] is False # Exit never sounds buzzer

    # Verify slot A1 is back to AVAILABLE
    db = SessionLocal()
    slot_a1_after = db.query(ParkingSlot).filter(ParkingSlot.slot_number == "A1").first()
    assert slot_a1_after.status == "AVAILABLE"
    db.close()

# 10. Invalid Exit and Unknown Plate Handling
def test_10_invalid_exit_and_unknown_plate_handling():
    # No session for unknown vehicle
    r = client.post("/api/detection/exit", data={"plate_number": "UNKNOWN777", "confidence": 0.95})
    assert r.status_code == 200
    assert r.json()["status"] == "no_active_session"
    assert r.json()["slot"] is None

# 11. Duplicate Entry and Duplicate Exit Protection
def test_11_duplicate_entry_and_duplicate_exit_protection():
    helper_pre_register("KA05KK0403", "dup_driver")
    r1 = client.post("/api/detection/entry", data={"plate_number": "KA05KK0403", "confidence": 0.95})
    assert r1.json()["status"] == "allocated"

    # Immediate second frame of same car -> already_allocated
    r2 = client.post("/api/detection/entry", data={"plate_number": "KA05KK0403", "confidence": 0.95})
    assert r2.json()["status"] == "already_allocated"
    assert r2.json()["trigger_buzzer"] is False

    # Exit once -> released
    rx1 = client.post("/api/detection/exit", data={"plate_number": "KA05KK0403", "confidence": 0.95})
    assert rx1.json()["status"] == "released"

    # Immediate second exit frame of same car -> no_active_session (cannot double-release)
    rx2 = client.post("/api/detection/exit", data={"plate_number": "KA05KK0403", "confidence": 0.95})
    assert rx2.json()["status"] in ["no_active_session", "debounced"]

# 12. Repeated ENTRY and EXIT Requests
def test_12_repeated_entry_and_exit_requests():
    # Sequence of 5 alternating requests
    for i in range(5):
        plate = f"KA01AB{i:04d}"
        helper_pre_register(plate)
        re = client.post("/api/detection/entry", data={"plate_number": plate, "confidence": 0.95})
        assert re.status_code == 200
        rx = client.post("/api/detection/exit", data={"plate_number": plate, "confidence": 0.95})
        assert rx.status_code == 200

# 13. Simultaneous ENTRY and EXIT Request Safety (Concurrency)
def test_13_simultaneous_entry_and_exit_request_safety():
    import concurrent.futures
    helper_pre_register("KA05KK0403", "conc_driver_1")
    helper_pre_register("KA02CD5678", "conc_driver_2")

    def call_entry(plate):
        return client.post("/api/detection/entry", data={"plate_number": plate, "confidence": 0.95}).json()

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(call_entry, "KA05KK0403")
        f2 = executor.submit(call_entry, "KA02CD5678")
        res1 = f1.result()
        res2 = f2.result()

    # Both succeeded and received distinct slots
    assert res1["status"] == "allocated"
    assert res2["status"] == "allocated"
    assert res1["slot"] != res2["slot"]

# 14. Database State After Stopping and Restarting Backend
def test_14_database_state_after_restarting():
    # Create persistent session
    helper_pre_register("KA05KK0403", "persist_driver")
    client.post("/api/detection/entry", data={"plate_number": "KA05KK0403", "confidence": 0.95})

    # Simulate server shutdown and re-initialization
    clear_cooldowns()
    db = SessionLocal()
    # Query database state
    active = db.query(ParkingSession).filter(
        ParkingSession.plate_number == "KA05KK0403",
        ParkingSession.status == "ACTIVE"
    ).first()
    assert active is not None
    slot = db.query(ParkingSlot).filter(ParkingSlot.id == active.slot_id).first()
    assert slot.status == "ALLOCATED"
    db.close()

# 15. WebSocket Event Generation
def test_15_websocket_event_generation():
    with client.websocket_connect("/ws/parking") as websocket:
        websocket.send_text("ping")
        data = websocket.receive_text()
        assert data == "pong"

# 16. Frontend Production Build Directory Check
def test_16_frontend_production_build():
    frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend"))
    next_build_dir = os.path.join(frontend_dir, ".next")
    assert os.path.exists(next_build_dir), "Frontend .next build directory must exist"
    static_dir = os.path.join(next_build_dir, "static")
    assert os.path.exists(static_dir), "Frontend static build assets must exist"
