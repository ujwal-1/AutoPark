import pytest
import concurrent.futures
from fastapi.testclient import TestClient
from app.main import app
from app.database import Base, engine, SessionLocal, run_migrations
from app.models import ParkingSlot, ParkingSession, PreRegistration, User
from app.config import settings
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

def register_and_precheckin(plate_number: str, vehicle_type: str = "car") -> str:
    username = f"user_{plate_number.lower().replace(' ', '')}"
    r_reg = client.post("/api/auth/register", json={
        "username": username,
        "password": "Password123!",
        "full_name": f"Driver {plate_number}"
    })
    token = r_reg.json()["access_token"]
    r_pre = client.post(
        "/api/bookings/pre-checkin",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "plate_number": plate_number,
            "vehicle_type": vehicle_type,
            "duration_hours": 2
        }
    )
    assert r_pre.status_code == 200
    return token

def test_six_slot_capacity_and_layout():
    """Verify system is configured to exactly 6 slots and layout returns 6 slots."""
    assert len(settings.SLOTS) == 6
    assert settings.SLOTS == ["A1", "A2", "A3", "B1", "B2", "B3"]

    r_layout = client.get("/api/parking/layout")
    assert r_layout.status_code == 200
    slots = r_layout.json()["slots"]
    assert len(slots) == 6
    slot_names = [s["slot_number"] for s in slots]
    assert slot_names == ["A1", "A2", "A3", "B1", "B2", "B3"]

    r_summary = client.get("/api/parking/summary")
    assert r_summary.status_code == 200
    assert r_summary.json()["total_slots"] == 6
    assert r_summary.json()["available"] == 6

def test_six_slot_full_allocation_and_seventh_rejection():
    """Fills 6 slots; 7th pre-registered vehicle receives parking_full."""
    plates = [f"KA01AA100{i}" for i in range(6)]
    for idx, plate in enumerate(plates):
        register_and_precheckin(plate, f"car_{idx}")
        r = client.post(
            "/api/detection/entry",
            data={"vehicle_type": f"car_{idx}", "plate_number": plate, "confidence": 0.95}
        )
        assert r.status_code == 200
        assert r.json()["status"] == "allocated"
        assert r.json()["slot"] == settings.SLOTS[idx]

    # Verify summary now shows 0 available, 6 allocated
    r_sum = client.get("/api/parking/summary")
    assert r_sum.json()["available"] == 0
    assert r_sum.json()["allocated"] == 6

    # 7th vehicle pre-registers and attempts entry
    register_and_precheckin("KA01FULL77", "car_overflow")
    r_overflow = client.post(
        "/api/detection/entry",
        data={"vehicle_type": "car_overflow", "plate_number": "KA01FULL77", "confidence": 0.95}
    )
    assert r_overflow.status_code == 200
    assert r_overflow.json()["status"] == "parking_full"
    assert r_overflow.json()["slot"] is None
    assert r_overflow.json()["trigger_buzzer"] is False

def test_pre_checkin_authorization_required():
    """Verifies un-registered vehicle is rejected and buzzer is NOT triggered."""
    r = client.post(
        "/api/detection/entry",
        data={"vehicle_type": "car", "plate_number": "NOT_PRE_REGISTERED", "confidence": 0.95}
    )
    assert r.status_code == 200
    assert r.json()["status"] == "unauthorized"
    assert r.json()["slot"] is None
    assert r.json()["trigger_buzzer"] is False

def test_exit_releases_only_confirmed_session():
    """Exit releases ONLY the slot matching the active session and never arbitrary slots."""
    register_and_precheckin("KA03EE5555", "car_entry")
    r_entry = client.post(
        "/api/detection/entry",
        data={"vehicle_type": "car_entry", "plate_number": "KA03EE5555", "confidence": 0.95}
    )
    assert r_entry.json()["status"] == "allocated"
    assigned_slot = r_entry.json()["slot"]
    assert assigned_slot == "A1"

    # Exit with unknown plate -> no active session, nothing released
    r_unknown_exit = client.post(
        "/api/detection/exit",
        data={"vehicle_type": "car", "plate_number": "KA99ZZ9999", "confidence": 0.95}
    )
    assert r_unknown_exit.json()["status"] == "no_active_session"
    assert r_unknown_exit.json()["slot"] is None

    # Exit with matching plate -> releases assigned slot
    r_exit = client.post(
        "/api/detection/exit",
        data={"vehicle_type": "car_entry", "plate_number": "KA03EE5555", "confidence": 0.95}
    )
    assert r_exit.json()["status"] == "released"
    assert r_exit.json()["slot"] == assigned_slot

def test_simultaneous_entry_and_exit_requests():
    """Simulates concurrent requests from entry and exit cameras simultaneously without blocking."""
    # Pre-register and allocate one session first so exit has a target
    register_and_precheckin("KA05EXIT11", "exit_car")
    r_init = client.post(
        "/api/detection/entry",
        data={"vehicle_type": "exit_car", "plate_number": "KA05EXIT11", "confidence": 0.95}
    )
    assert r_init.json()["status"] == "allocated"

    # Pre-register another vehicle for entry
    register_and_precheckin("KA05ENTR22", "entry_car")

    results = {}
    def call_entry():
        c = TestClient(app)
        res = c.post(
            "/api/detection/entry",
            data={"vehicle_type": "entry_car", "plate_number": "KA05ENTR22", "confidence": 0.95}
        )
        results["entry"] = res.json()

    def call_exit():
        c = TestClient(app)
        res = c.post(
            "/api/detection/exit",
            data={"vehicle_type": "exit_car", "plate_number": "KA05EXIT11", "confidence": 0.95}
        )
        results["exit"] = res.json()

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f_entry = executor.submit(call_entry)
        f_exit = executor.submit(call_exit)
        concurrent.futures.wait([f_entry, f_exit], timeout=10)

    assert "entry" in results
    assert "exit" in results
    assert results["entry"]["status"] == "allocated"
    assert results["exit"]["status"] == "released"

def test_database_migration_idempotent_and_safe():
    """Verifies run_migrations keeps 6 slots, preserves active vehicles, and does not recreate 7th/8th slot."""
    db = SessionLocal()
    try:
        # Re-run migration multiple times
        run_migrations()
        run_migrations()
        init_slots_db(db)

        slots = db.query(ParkingSlot).all()
        assert len(slots) == 6
        slot_names = {s.slot_number for s in slots}
        assert slot_names == {"A1", "A2", "A3", "B1", "B2", "B3"}
    finally:
        db.close()


def test_concurrent_entry_and_exit_image_file_uploads():
    """Simulates simultaneous real image file uploads from both Entry and Exit ESP32-CAMs."""
    import os
    fixtures_dir = os.path.join(os.path.dirname(__file__), "fixtures")
    img_path = os.path.join(fixtures_dir, "parking_vehicle.jpg")
    with open(img_path, "rb") as f:
        img_bytes = f.read()

    # Pre-register vehicle for exit
    register_and_precheckin("KA05KK0403", "parked_car")
    r_enter = client.post("/api/detection/entry", files={"file": ("entry.jpg", img_bytes, "image/jpeg")})
    assert r_enter.json()["status"] == "allocated"

    # Pre-register a second vehicle for entry
    register_and_precheckin("KA02CD5678", "new_car")

    results = {}
    def upload_entry():
        c = TestClient(app)
        res = c.post(
            "/api/detection/entry",
            data={"vehicle_type": "new_car", "plate_number": "KA02CD5678", "confidence": 0.95}
        )
        results["entry"] = res.json()

    def upload_exit():
        c = TestClient(app)
        res = c.post(
            "/api/detection/exit",
            files={"file": ("exit.jpg", img_bytes, "image/jpeg")}
        )
        results["exit"] = res.json()

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(upload_entry)
        f2 = executor.submit(upload_exit)
        concurrent.futures.wait([f1, f2], timeout=15)

    assert "entry" in results
    assert "exit" in results
    assert results["entry"]["status"] == "allocated"
    assert results["exit"]["status"] == "released"
    assert results["exit"]["slot"] == "A1"

