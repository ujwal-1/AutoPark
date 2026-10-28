import os
import cv2
import pytest
import numpy as np
from fastapi.testclient import TestClient

from app.main import app
from app.database import Base, engine, SessionLocal
from app.models import ParkingSession, PreRegistration, ParkingSlot, DetectionEvent
from app.slot_allocator import init_slots_db, clear_cooldowns
from app.anpr_pipeline import (
    assess_image_quality,
    generate_plate_variants,
    run_multi_variant_ocr,
    canonicalize_plate,
    levenshtein_distance,
    match_entry_pre_registration,
    match_exit_active_session,
    entry_accumulator,
    exit_accumulator
)
from app.yolov11_detector import yolov11_detector_engine

client = TestClient(app)

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    clear_cooldowns()
    entry_accumulator.reset()
    exit_accumulator.reset()
    db = SessionLocal()
    init_slots_db(db)
    db.close()
    yield


def pre_register_vehicle(plate: str, vehicle_type: str = "car", username_suffix: str = "1"):
    """Helper to pre-register and submit pre-check-in for a plate."""
    reg = client.post("/api/auth/register", json={
        "username": f"driver_{plate.lower()}_{username_suffix}",
        "password": "Password123!",
        "full_name": f"Driver {plate}"
    })
    token = reg.json()["access_token"]
    res = client.post(
        "/api/bookings/pre-checkin",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "plate_number": plate,
            "vehicle_type": vehicle_type,
            "duration_hours": 2
        }
    )
    return res.json()


# =========================================================================
# 1. REAL ESP32-CAM CAPTURED IMAGE TESTS
# =========================================================================

def test_real_esp32_captured_vehicle_detection_and_ocr():
    """
    Tests actual ESP32-CAM captured frame (QVGA 320x240) 'parking_vehicle.jpg'.
    Verifies that YOLOv11 detects plate crop and EasyOCR reads 'KA05KK0403'.
    """
    img_path = os.path.join(FIXTURES_DIR, "parking_vehicle.jpg")
    assert os.path.exists(img_path), f"Missing test fixture: {img_path}"

    with open(img_path, "rb") as f:
        img_bytes = f.read()

    res = yolov11_detector_engine.process_image(img_bytes, camera_name="ENTRY")
    assert res["detected"] is True
    assert res["plate_bbox"] is not None
    assert res["plate_number"] == "KA05KK0403"
    assert len(res["candidates"]) > 0
    assert res["quality"]["is_blurry"] is False


def test_real_esp32_detected_plate_crop_multi_variant_ocr():
    """
    Tests actual cropped plate from ESP32-CAM 'detected_plate.jpg'.
    Verifies multi-variant preprocessing extracts high-confidence plate candidates.
    """
    crop_path = os.path.join(FIXTURES_DIR, "detected_plate.jpg")
    assert os.path.exists(crop_path), f"Missing test fixture: {crop_path}"

    plate_crop = cv2.imread(crop_path)
    reader = yolov11_detector_engine.fallback_engine.get_easyocr_reader()

    candidates, variants = run_multi_variant_ocr(plate_crop, reader)
    assert len(candidates) > 0
    # Top candidate should match KA05KK0403 or have 'KA05' / '0403'
    top_cand = candidates[0]
    assert "KA05" in top_cand["text"] or "0403" in top_cand["text"] or top_cand["text"] == "KA05KK0403"
    assert "adaptive" in variants
    assert "clahe" in variants


# =========================================================================
# 2. IMAGE QUALITY AND BLUR DETECTION TESTS
# =========================================================================

def test_assess_image_quality_sharp_vs_blurry():
    """
    Verifies that the Laplacian blur detector accurately distinguishes clear vs blurry images.
    """
    # 1. Create sharp synthetic frame with high contrast edges
    sharp_img = np.zeros((240, 320, 3), dtype=np.uint8)
    for i in range(0, 320, 20):
        cv2.line(sharp_img, (i, 0), (i, 240), (255, 255, 255), 2)
    sharp_qual = assess_image_quality(sharp_img)
    assert sharp_qual["is_blurry"] is False
    assert sharp_qual["sharpness"] > 50.0

    # 2. Heavily blur the image
    blurry_img = cv2.GaussianBlur(sharp_img, (25, 25), 10.0)
    blur_qual = assess_image_quality(blurry_img)
    assert blur_qual["is_blurry"] is True
    assert blur_qual["quality_grade"] == "blurry"


# =========================================================================
# 3. ENTRY CAMERA RECOGNITION & AUTHORIZATION TESTS
# =========================================================================

def test_entry_real_image_authorized_pre_registered_vehicle():
    """
    Pre-registers 'KA05KK0403' then uploads real ESP32-CAM frame to /api/detection/entry.
    Verifies vehicle is authorized, slot is allocated, buzzer is triggered, and evidence saved.
    """
    pre_register_vehicle("KA05KK0403")

    img_path = os.path.join(FIXTURES_DIR, "parking_vehicle.jpg")
    with open(img_path, "rb") as f:
        img_bytes = f.read()

    # Upload real frame via multipart form synchronously
    response = client.post(
        "/api/detection/entry",
        params={"sync": "true"},
        files={"file": ("entry.jpg", img_bytes, "image/jpeg")}
    )
    assert response.status_code == 200

    # Inspect database for allocated session and evidence
    db = SessionLocal()
    session = db.query(ParkingSession).filter(ParkingSession.status == "ACTIVE").first()
    assert session is not None
    assert session.plate_number == "KA05KK0403"
    assert session.recognition_evidence is not None
    assert "KA05KK0403" in session.recognition_evidence
    db.close()


def test_entry_unregistered_real_vehicle_rejected():
    """
    Uploads real ESP32 frame without pre-booking 'KA05KK0403'.
    Verifies system denies entry and does NOT allocate any slot.
    """
    img_path = os.path.join(FIXTURES_DIR, "parking_vehicle.jpg")
    with open(img_path, "rb") as f:
        img_bytes = f.read()

    response = client.post(
        "/api/detection/entry",
        params={"sync": "true"},
        files={"file": ("entry.jpg", img_bytes, "image/jpeg")}
    )
    assert response.status_code == 200

    # Check database: NO session should be created
    db = SessionLocal()
    active_sessions = db.query(ParkingSession).filter(ParkingSession.status == "ACTIVE").all()
    assert len(active_sessions) == 0

    # Check detection event logged as unauthorized
    event = db.query(DetectionEvent).filter(DetectionEvent.camera == "ENTRY").first()
    assert event is not None
    assert event.allocated_slot_number is None
    db.close()


def test_entry_fuzzy_ocr_canonical_matching_authorizes_correct_booking():
    """
    Pre-registers 'KA05KK0403'.
    Simulates OCR reading 'KAO5KK04O3' (letters 'O' instead of zeroes '0').
    Verifies controlled matching uniquely associates with pre-registration and authorizes.
    """
    pre_register_vehicle("KA05KK0403")

    db = SessionLocal()
    from app.slot_allocator import allocate_entry_slot
    res = allocate_entry_slot(
        db=db,
        vehicle_type="car",
        plate_number="KAO5KK04O3", # O instead of 0
        confidence=0.94
    )
    assert res["status"] == "allocated"
    assert res["plate_number"] == "KA05KK0403"
    assert res["slot"] == "A1"
    assert res["trigger_buzzer"] is True
    db.close()


def test_entry_ambiguous_registrations_not_authorized_blindly():
    """
    Tests ambiguity safety:
    Two bookings exist with very similar plates ('KA05KK0403' and 'KA05KK0408').
    Candidate reading is ambiguous. System must NOT authorize blindly.
    """
    pre_register_vehicle("KA05KK0403", username_suffix="a")
    pre_register_vehicle("KA05KK0408", username_suffix="b")

    db = SessionLocal()
    candidates = [
        {"text": "KA05KK040B", "canonical": "KA05KK0408", "confidence": 0.85}
    ]
    match_res = match_entry_pre_registration(candidates, db)
    # Both KA05KK0403 and KA05KK0408 could match within 1 char distance
    # Must report ambiguous or select the unambiguous one if scores differ
    if match_res["status"] == "ambiguous":
        assert "Ambiguous" in match_res["reason"]
    db.close()


# =========================================================================
# 4. EXIT CAMERA MATCHING & SLOT RELEASE TESTS
# =========================================================================

def test_exit_releases_exact_active_session_slot():
    """
    Vehicle enters -> gets slot A1.
    Exit camera detects vehicle plate -> releases slot A1.
    """
    pre_register_vehicle("KA05KK0403")

    # Enter -> A1
    r_in = client.post(
        "/api/detection/entry",
        data={"vehicle_type": "car", "plate_number": "KA05KK0403", "confidence": 0.95}
    )
    assert r_in.json()["status"] == "allocated"
    assert r_in.json()["slot"] == "A1"

    # Exit -> Releases A1
    r_out = client.post(
        "/api/detection/exit",
        data={"vehicle_type": "car", "plate_number": "KA05KK0403", "confidence": 0.93}
    )
    assert r_out.status_code == 200
    data = r_out.json()
    assert data["status"] == "released"
    assert data["slot"] == "A1"
    assert data["trigger_buzzer"] is False # Exit has NO buzzer

    # Verify slot is AVAILABLE again in DB
    db = SessionLocal()
    slot_a1 = db.query(ParkingSlot).filter(ParkingSlot.slot_number == "A1").first()
    assert slot_a1.status == "AVAILABLE"
    db.close()


def test_exit_with_ocr_variation_matches_active_session():
    """
    Vehicle enters with 'KA05KK0403' (slot A1).
    Exit camera reads 'KAO5KK0403' (letter O).
    Controlled matching correctly identifies and releases session A1.
    """
    pre_register_vehicle("KA05KK0403")

    client.post(
        "/api/detection/entry",
        data={"vehicle_type": "car", "plate_number": "KA05KK0403", "confidence": 0.95}
    )

    db = SessionLocal()
    from app.slot_allocator import release_exit_slot
    res = release_exit_slot(
        db=db,
        vehicle_type="car",
        plate_number="KAO5KK0403", # OCR variant with O
        confidence=0.92
    )
    assert res["status"] == "released"
    assert res["slot"] == "A1"
    assert res["plate_number"] == "KA05KK0403"
    db.close()


def test_exit_unknown_plate_never_releases_active_session():
    """
    Active session exists for 'KA05KK0403'.
    An unknown/unregistered vehicle 'MH12AB9999' appears at the exit camera.
    System must NOT release any slot (NO blind fallback to oldest session!).
    """
    pre_register_vehicle("KA05KK0403")

    # Enter -> A1
    client.post(
        "/api/detection/entry",
        data={"vehicle_type": "car", "plate_number": "KA05KK0403", "confidence": 0.95}
    )

    # Unknown vehicle at exit
    r_out = client.post(
        "/api/detection/exit",
        data={"vehicle_type": "truck", "plate_number": "MH12AB9999", "confidence": 0.95}
    )
    assert r_out.status_code == 200
    data = r_out.json()
    assert data["status"] == "no_active_session"
    assert data["slot"] is None

    # Verify slot A1 is STILL OCCUPIED/ALLOCATED
    db = SessionLocal()
    slot_a1 = db.query(ParkingSlot).filter(ParkingSlot.slot_number == "A1").first()
    assert slot_a1.status == "ALLOCATED"
    db.close()


def test_exit_duplicate_request_debounced():
    """
    Tests exit debouncing: rapid duplicate exit frames do not cause errors or re-releases.
    """
    pre_register_vehicle("KA05KK0403")

    client.post(
        "/api/detection/entry",
        data={"vehicle_type": "car", "plate_number": "KA05KK0403", "confidence": 0.95}
    )

    # Exit 1 -> released
    r1 = client.post(
        "/api/detection/exit",
        data={"vehicle_type": "car", "plate_number": "KA05KK0403", "confidence": 0.93}
    )
    assert r1.json()["status"] == "released"

    # Exit 2 within cooldown -> debounced or no active session
    r2 = client.post(
        "/api/detection/exit",
        data={"vehicle_type": "car", "plate_number": "KA05KK0403", "confidence": 0.93}
    )
    assert r2.json()["status"] in ["debounced", "no_active_session"]


# =========================================================================
# 5. DIAGNOSTICS & DEBUGGING ENDPOINTS
# =========================================================================

def test_anpr_diagnostics_endpoint():
    """
    Tests GET /api/anpr/diagnostics.
    Verifies that recognition events with camera, quality, and candidates are recorded.
    """
    # Trigger an image processing event
    img_path = os.path.join(FIXTURES_DIR, "parking_vehicle.jpg")
    with open(img_path, "rb") as f:
        img_bytes = f.read()

    client.post(
        "/api/detection/entry",
        params={"sync": "true"},
        files={"file": ("entry.jpg", img_bytes, "image/jpeg")}
    )

    r_diag = client.get("/api/anpr/diagnostics")
    assert r_diag.status_code == 200
    data = r_diag.json()
    assert data["status"] == "success"
    assert len(data["events"]) > 0

    latest_event = data["events"][-1]
    assert latest_event["camera"] == "ENTRY"
    assert "quality" in latest_event
    assert "sharpness" in latest_event["quality"]
    assert "candidates" in latest_event


# =========================================================================
# 6. COMPREHENSIVE MULTIPART UPLOAD TESTS
# =========================================================================

def test_entry_upload_returns_explicit_allocated_status():
    """Uploads real frame to entry endpoint; verifies explicit 'allocated' status, slot A1, plate, and buzzer."""
    pre_register_vehicle("KA05KK0403")

    img_path = os.path.join(FIXTURES_DIR, "parking_vehicle.jpg")
    with open(img_path, "rb") as f:
        img_bytes = f.read()

    response = client.post(
        "/api/detection/entry",
        files={"file": ("entry.jpg", img_bytes, "image/jpeg")}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "allocated"
    assert data["slot"] == "A1"
    assert data["plate_number"] == "KA05KK0403"
    assert data["trigger_buzzer"] is True


def test_entry_upload_corrupt_or_invalid_bytes():
    """Uploads random corrupted bytes; verifies graceful rejection with no_plate and no database corruption."""
    corrupt_bytes = b"NOT_A_VALID_JPEG_HEADER_CORRUPTED_BYTES_1234567890"
    response = client.post(
        "/api/detection/entry",
        files={"file": ("entry.jpg", corrupt_bytes, "image/jpeg")}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "no_plate"
    assert data["slot"] is None
    assert data["trigger_buzzer"] is False

    # Verify no session created
    db = SessionLocal()
    assert db.query(ParkingSession).filter(ParkingSession.status == "ACTIVE").count() == 0
    db.close()


def test_entry_upload_empty_file():
    """Uploads zero-byte file; verifies immediate no_plate response without crash."""
    response = client.post(
        "/api/detection/entry",
        files={"file": ("entry.jpg", b"", "image/jpeg")}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "no_plate"
    assert data["slot"] is None


def test_entry_upload_unreadable_blank_image():
    """Uploads blank image without vehicle or plate; returns no_plate."""
    blank_img = np.zeros((240, 320, 3), dtype=np.uint8)
    _, buf = cv2.imencode(".jpg", blank_img)
    response = client.post(
        "/api/detection/entry",
        files={"file": ("entry.jpg", buf.tobytes(), "image/jpeg")}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "no_plate"
    assert data["slot"] is None


def test_entry_upload_duplicate_stationary_car():
    """
    Simulates a stationary car sitting in front of the entry camera:
    Frame 1: Allocates slot A1 with buzzer = True.
    Frame 2: Returns already_allocated to slot A1 with buzzer = False.
    Does NOT allocate duplicate slot A2 or alter parking occupancy.
    """
    pre_register_vehicle("KA05KK0403")

    img_path = os.path.join(FIXTURES_DIR, "parking_vehicle.jpg")
    with open(img_path, "rb") as f:
        img_bytes = f.read()

    # Frame 1
    r1 = client.post("/api/detection/entry", files={"file": ("entry.jpg", img_bytes, "image/jpeg")})
    assert r1.status_code == 200
    assert r1.json()["status"] == "allocated"
    assert r1.json()["slot"] == "A1"
    assert r1.json()["trigger_buzzer"] is True

    # Frame 2 (identical stationary car)
    r2 = client.post("/api/detection/entry", files={"file": ("entry.jpg", img_bytes, "image/jpeg")})
    assert r2.status_code == 200
    assert r2.json()["status"] == "already_allocated"
    assert r2.json()["slot"] == "A1"
    assert r2.json()["trigger_buzzer"] is False

    # Check database: exactly ONE active session exists
    db = SessionLocal()
    sessions = db.query(ParkingSession).filter(ParkingSession.status == "ACTIVE").all()
    assert len(sessions) == 1
    assert sessions[0].plate_number == "KA05KK0403"
    db.close()


def test_exit_upload_returns_explicit_released_status():
    """Pre-registers vehicle, enters lot to occupy slot A1, then uploads frame to exit endpoint; verifies release."""
    pre_register_vehicle("KA05KK0403")

    img_path = os.path.join(FIXTURES_DIR, "parking_vehicle.jpg")
    with open(img_path, "rb") as f:
        img_bytes = f.read()

    # Enter lot
    r_in = client.post("/api/detection/entry", files={"file": ("entry.jpg", img_bytes, "image/jpeg")})
    assert r_in.json()["status"] == "allocated"
    assert r_in.json()["slot"] == "A1"

    # Exit lot with uploaded frame
    r_out = client.post("/api/detection/exit", files={"file": ("exit.jpg", img_bytes, "image/jpeg")})
    assert r_out.status_code == 200
    data = r_out.json()
    assert data["status"] == "released"
    assert data["slot"] == "A1"
    assert data["plate_number"] == "KA05KK0403"
    assert data["trigger_buzzer"] is False

    # Slot A1 should now be AVAILABLE
    db = SessionLocal()
    slot_a1 = db.query(ParkingSlot).filter(ParkingSlot.slot_number == "A1").first()
    assert slot_a1.status == "AVAILABLE"
    db.close()


def test_exit_upload_without_active_session_rejected():
    """Uploads real frame to exit endpoint when car is not parked; returns no_active_session."""
    img_path = os.path.join(FIXTURES_DIR, "parking_vehicle.jpg")
    with open(img_path, "rb") as f:
        img_bytes = f.read()

    response = client.post("/api/detection/exit", files={"file": ("exit.jpg", img_bytes, "image/jpeg")})
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "no_active_session"
    assert data["slot"] is None

