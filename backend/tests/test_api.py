import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import Base, engine, SessionLocal
from app.slot_allocator import init_slots_db, clear_cooldowns

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    clear_cooldowns()
    db = SessionLocal()
    init_slots_db(db)
    db.close()
    yield

def pre_register_driver_vehicle(plate_number: str, vehicle_type: str = "green_rc_car"):
    """Helper to pre-register driver account and submit pre-checkin before entry."""
    username = f"usr_{plate_number.lower().replace(' ', '')}"
    reg = client.post("/api/auth/register", json={
        "username": username,
        "password": "Password123!",
        "full_name": f"Driver {plate_number}"
    })
    token = reg.json()["access_token"]
    client.post(
        "/api/bookings/pre-checkin",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "plate_number": plate_number,
            "vehicle_type": vehicle_type
        }
    )

def test_entry_allocation_success():
    pre_register_driver_vehicle("KA01AB1234")
    response = client.post(
        "/api/detection/entry",
        data={"vehicle_type": "green_rc_car", "plate_number": "KA01AB1234", "confidence": 0.95}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "allocated"
    assert data["slot"] == "A1"
    assert data["plate_number"] == "KA01AB1234"
    assert data["trigger_buzzer"] is True

def test_unregistered_entry_rejected():
    # Vehicle NOT pre-registered -> gate denial
    response = client.post(
        "/api/detection/entry",
        data={"vehicle_type": "green_rc_car", "plate_number": "UNREG5555", "confidence": 0.95}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "unauthorized"
    assert data["slot"] is None
    assert data["trigger_buzzer"] is False

def test_no_plate_rejected():
    response = client.post(
        "/api/detection/entry",
        data={"vehicle_type": "green_rc_car", "plate_number": "", "confidence": 0.95}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "no_plate"
    assert data["slot"] is None
    assert data["trigger_buzzer"] is False

def test_short_plate_rejected():
    response = client.post(
        "/api/detection/entry",
        data={"vehicle_type": "green_rc_car", "plate_number": "KA1", "confidence": 0.95}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "no_plate"
    assert data["slot"] is None
    assert data["trigger_buzzer"] is False

def test_duplicate_same_vehicle_entry():
    pre_register_driver_vehicle("KA01AB1234")

    # Frame 1: recognize -> allocate A1
    r1 = client.post(
        "/api/detection/entry",
        data={"vehicle_type": "green_rc_car", "plate_number": "KA01AB1234", "confidence": 0.95}
    )
    assert r1.json()["status"] == "allocated"
    assert r1.json()["slot"] == "A1"
    assert r1.json()["trigger_buzzer"] is True

    # Frame 2: same plate -> DO NOT allocate another slot, points to A1
    r2 = client.post(
        "/api/detection/entry",
        data={"vehicle_type": "green_rc_car", "plate_number": "KA01AB1234", "confidence": 0.95}
    )
    assert r2.json()["status"] == "already_allocated"
    assert r2.json()["slot"] == "A1"
    assert r2.json()["trigger_buzzer"] is False

    # Frame 3: same plate -> DO NOT allocate another slot
    r3 = client.post(
        "/api/detection/entry",
        data={"vehicle_type": "green_rc_car", "plate_number": "KA01AB1234", "confidence": 0.95}
    )
    assert r3.json()["status"] == "already_allocated"
    assert r3.json()["slot"] == "A1"
    assert r3.json()["trigger_buzzer"] is False

def test_fuzzy_ocr_variation_same_vehicle():
    pre_register_driver_vehicle("KA01AB1234")

    # Car A enters with plate KA01AB1234 -> A1
    r1 = client.post(
        "/api/detection/entry",
        data={"vehicle_type": "green_rc_car", "plate_number": "KA01AB1234", "confidence": 0.95}
    )
    assert r1.json()["status"] == "allocated"
    assert r1.json()["slot"] == "A1"

    # Next frame OCR reads 'O' instead of '0': KAO1AB1234 -> fuzzy matches A1, no new slot
    r2 = client.post(
        "/api/detection/entry",
        data={"vehicle_type": "green_rc_car", "plate_number": "KAO1AB1234", "confidence": 0.95}
    )
    assert r2.json()["status"] == "already_allocated"
    assert r2.json()["slot"] == "A1"
    assert r2.json()["trigger_buzzer"] is False

def test_distinct_vehicles_allocate_separate_slots():
    pre_register_driver_vehicle("KA01AB1234")
    pre_register_driver_vehicle("KA02CD5678", vehicle_type="red_rc_car")

    # Car A plate KA01AB1234 -> allocates A1
    r1 = client.post(
        "/api/detection/entry",
        data={"vehicle_type": "green_rc_car", "plate_number": "KA01AB1234", "confidence": 0.95}
    )
    assert r1.json()["status"] == "allocated"
    assert r1.json()["slot"] == "A1"

    # Car B plate KA02CD5678 arrives -> immediately allocates A2 (no global blocking)
    r2 = client.post(
        "/api/detection/entry",
        data={"vehicle_type": "red_rc_car", "plate_number": "KA02CD5678", "confidence": 0.95}
    )
    assert r2.json()["status"] == "allocated"
    assert r2.json()["slot"] == "A2"
    assert r2.json()["trigger_buzzer"] is True

def test_exit_release_success():
    pre_register_driver_vehicle("KA01AB1234")

    # Enter -> A1
    client.post(
        "/api/detection/entry",
        data={"vehicle_type": "green_rc_car", "plate_number": "KA01AB1234", "confidence": 0.95}
    )
    
    # Exit -> Releases A1
    r_exit = client.post(
        "/api/detection/exit",
        data={"vehicle_type": "green_rc_car", "plate_number": "KA01AB1234", "confidence": 0.92}
    )
    assert r_exit.status_code == 200
    data = r_exit.json()
    assert data["status"] == "released"
    assert data["slot"] == "A1"
    assert data["trigger_buzzer"] is False

def test_exit_safety_rule_no_active_session():
    # Exit camera detects vehicle, but NO session is active
    r_exit = client.post(
        "/api/detection/exit",
        data={"vehicle_type": "green_rc_car", "plate_number": "KA01AB1234", "confidence": 0.92}
    )
    assert r_exit.status_code == 200
    data = r_exit.json()
    assert data["status"] == "no_active_session"
    assert data["slot"] is None
    assert data["trigger_buzzer"] is False

def test_low_confidence_ignored():
    r = client.post(
        "/api/detection/entry",
        data={"vehicle_type": "green_rc_car", "plate_number": "KA01AB1234", "confidence": 0.42}
    )
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ignored"
    assert data["slot"] is None
    assert data["trigger_buzzer"] is False

def test_parking_full_scenario():
    # Fill all 6 slots with distinct vehicle plates
    slots = ["A1", "A2", "A3", "B1", "B2", "B3"]
    for i in range(len(slots)):
        plate = f"KA01AB100{i}"
        pre_register_driver_vehicle(plate, vehicle_type=f"car_{i}")
        r = client.post(
            "/api/detection/entry",
            data={"vehicle_type": f"car_{i}", "plate_number": plate, "confidence": 0.95}
        )
        assert r.status_code == 200
        assert r.json()["status"] == "allocated"
        assert r.json()["slot"] == slots[i]

    # 7th distinct vehicle attempts entry when all 6 slots are filled
    pre_register_driver_vehicle("KA01AB9999", vehicle_type="car_99")
    r_full = client.post(
        "/api/detection/entry",
        data={"vehicle_type": "car_99", "plate_number": "KA01AB9999", "confidence": 0.95}
    )
    assert r_full.status_code == 200
    assert r_full.json()["status"] == "parking_full"
    assert r_full.json()["slot"] is None
    assert r_full.json()["trigger_buzzer"] is False

def test_demo_reset():
    client.post("/api/parking/simulate/entry")
    r_reset = client.post("/api/parking/reset")
    assert r_reset.status_code == 200
    assert r_reset.json()["status"] == "success"

    # Verify all 6 slots are available
    r_summary = client.get("/api/parking/summary")
    assert r_summary.json()["total_slots"] == 6
    assert r_summary.json()["available"] == 6
    assert r_summary.json()["allocated"] == 0

def test_manual_release():
    r_entry = client.post("/api/parking/simulate/entry")
    allocated_slot = r_entry.json()["slot"]

    r_release = client.post(f"/api/parking/release/{allocated_slot}")
    assert r_release.status_code == 200
    assert r_release.json()["status"] == "success"
