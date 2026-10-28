import pytest
import os
import sys
from fastapi.testclient import TestClient

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app, startup_event
from app.database import SessionLocal
from app.models import User, PreRegistration, ParkingSession, ParkingSlot

# Initialize DB
startup_event()
client = TestClient(app)

def test_full_auth_and_entry_lifecycle():
    db = SessionLocal()
    try:
        # Reset parking first
        reset_res = client.post("/api/parking/reset")
        assert reset_res.status_code == 200

        # Unique test username
        test_username = f"driver_test_{os.urandom(4).hex()}"
        test_password = "SecurePassword123!"

        # 1. Registration
        reg_payload = {
            "username": test_username,
            "password": test_password,
            "email": f"{test_username}@example.com",
            "full_name": "Antigravity Test Driver",
            "phone": "+919876543210"
        }
        reg_res = client.post("/api/auth/register", json=reg_payload)
        assert reg_res.status_code == 200, f"Registration failed: {reg_res.text}"
        reg_data = reg_res.json()
        assert "access_token" in reg_data
        assert reg_data["user"]["username"] == test_username
        token = reg_data["access_token"]

        # Verify password is NOT plaintext in DB
        user_in_db = db.query(User).filter(User.username == test_username).first()
        assert user_in_db is not None
        assert user_in_db.hashed_password != test_password
        assert user_in_db.hashed_password.startswith("$2b$")

        # 2. Failed Login (Wrong Password)
        fail_login = client.post("/api/auth/login", json={
            "username": test_username,
            "password": "WrongPassword!"
        })
        assert fail_login.status_code == 401

        # 3. Successful Login
        login_res = client.post("/api/auth/login", json={
            "username": test_username,
            "password": test_password
        })
        assert login_res.status_code == 200
        auth_token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {auth_token}"}

        # 4. Protected /api/auth/me
        me_res = client.get("/api/auth/me", headers=headers)
        assert me_res.status_code == 200
        assert me_res.json()["username"] == test_username

        # 5. Unauthorized Entry Attempt (Plate that was NEVER pre-checked in)
        unauth_entry = client.post(
            "/api/detection/entry",
            data={
                "vehicle_type": "Car",
                "plate_number": "UNREG7777",
                "confidence": 0.95
            }
        )
        assert unauth_entry.status_code == 200
        unauth_data = unauth_entry.json()
        assert unauth_data["status"] == "unauthorized"
        assert unauth_data["slot"] is None
        assert unauth_data["trigger_buzzer"] is False
        assert "not pre-registered" in unauth_data["message"]

        # 6. Pre-Check-in before arrival
        test_plate = f"KA01AB{os.urandom(2).hex().upper()}"
        precheck_res = client.post(
            "/api/bookings/pre-checkin",
            headers=headers,
            json={
                "plate_number": test_plate,
                "vehicle_type": "Sedan",
                "duration_hours": 3
            }
        )
        assert precheck_res.status_code == 200, f"Precheckin failed: {precheck_res.text}"
        booking_data = precheck_res.json()
        assert booking_data["status"] == "PENDING_ARRIVAL"
        assert booking_data["plate_number"] == test_plate

        # 7. Check My Status while PENDING_ARRIVAL
        status_pending = client.get("/api/bookings/my-status", headers=headers)
        assert status_pending.status_code == 200
        assert status_pending.json()["active_booking"] is not None
        assert status_pending.json()["active_booking"]["plate_number"] == test_plate
        assert status_pending.json()["has_active_entry"] is False

        # 8. Authorized Entry (Camera detects pre-registered plate)
        auth_entry = client.post(
            "/api/detection/entry",
            data={
                "vehicle_type": "Sedan",
                "plate_number": test_plate,
                "confidence": 0.96
            }
        )
        assert auth_entry.status_code == 200
        entry_data = auth_entry.json()
        assert entry_data["status"] == "allocated"
        assert entry_data["slot"] is not None
        assert entry_data["trigger_buzzer"] is True
        allocated_slot = entry_data["slot"]

        # Check DB session and booking
        booking_in_db = db.query(PreRegistration).filter(PreRegistration.id == booking_data["id"]).first()
        assert booking_in_db.status == "CHECKED_IN"
        session_in_db = db.query(ParkingSession).filter(
            ParkingSession.booking_id == booking_data["id"],
            ParkingSession.status == "ACTIVE"
        ).first()
        assert session_in_db is not None
        assert session_in_db.user_id == user_in_db.id

        # 9. Check My Status when PARKED
        status_parked = client.get("/api/bookings/my-status", headers=headers)
        assert status_parked.status_code == 200
        parked_json = status_parked.json()
        assert parked_json["has_active_entry"] is True
        assert parked_json["active_session"]["slot_number"] == allocated_slot

        # 10. Duplicate check-in while already parked should fail
        dup_precheck = client.post(
            "/api/bookings/pre-checkin",
            headers=headers,
            json={
                "plate_number": "KA02CD1234",
                "vehicle_type": "SUV"
            }
        )
        assert dup_precheck.status_code == 400
        assert "already have an active vehicle" in dup_precheck.json()["detail"]

        # 11. Exit safety validation: Exit attempt with UNKNOWN plate
        exit_unknown = client.post(
            "/api/detection/exit",
            data={
                "vehicle_type": "Car",
                "plate_number": "RANDOM9999",
                "confidence": 0.94
            }
        )
        assert exit_unknown.status_code == 200
        assert exit_unknown.json()["status"] == "no_active_session"

        # Verify our slot is STILL allocated/occupied and NOT released by the unknown car
        slot_obj = db.query(ParkingSlot).filter(ParkingSlot.slot_number == allocated_slot).first()
        assert slot_obj.status == "ALLOCATED"

        # 12. Authorized Exit
        auth_exit = client.post(
            "/api/detection/exit",
            data={
                "vehicle_type": "Sedan",
                "plate_number": test_plate,
                "confidence": 0.95
            }
        )
        assert auth_exit.status_code == 200
        exit_res_data = auth_exit.json()
        assert exit_res_data["status"] == "released"
        assert exit_res_data["slot"] == allocated_slot
        assert exit_res_data["trigger_buzzer"] is False

        # Verify slot is now AVAILABLE and session completed
        db.refresh(slot_obj)
        assert slot_obj.status == "AVAILABLE"
        db.refresh(session_in_db)
        assert session_in_db.status == "COMPLETED"
        assert session_in_db.exit_time is not None
        db.refresh(booking_in_db)
        assert booking_in_db.status == "COMPLETED"

        # 13. My History endpoint check
        history_res = client.get("/api/bookings/my-history", headers=headers)
        assert history_res.status_code == 200
        history_items = history_res.json()["history"]
        assert len(history_items) >= 1
        assert history_items[0]["plate_number"] == test_plate
        assert history_items[0]["slot_number"] == allocated_slot
        assert history_items[0]["status"] == "COMPLETED"

        print("\nAll auth and parking lifecycle assertions PASSED successfully!")
    finally:
        db.close()


def test_parking_full_capacity():
    db = SessionLocal()
    try:
        # Reset parking first to get all 6 slots available
        client.post("/api/parking/reset")

        slots = db.query(ParkingSlot).all()
        assert len(slots) == 6

        # Create 6 registered users and 6 pending pre-registrations to fill all 6 slots
        for i in range(6):
            u_name = f"full_user_{i}_{os.urandom(3).hex()}"
            plate = f"FULL{i:02d}AA"
            reg_res = client.post("/api/auth/register", json={
                "username": u_name,
                "password": "Password123!",
                "full_name": f"Full User {i}"
            })
            token = reg_res.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            # Pre-checkin
            p_res = client.post("/api/bookings/pre-checkin", headers=headers, json={
                "plate_number": plate,
                "vehicle_type": "Car"
            })
            assert p_res.status_code == 200

            # Enter through gate
            e_res = client.post("/api/detection/entry", data={
                "vehicle_type": "Car",
                "plate_number": plate,
                "confidence": 0.95
            })
            assert e_res.status_code == 200
            assert e_res.json()["status"] == "allocated"

        # Now all 6 slots are ALLOCATED. Try 7th vehicle!
        extra_user = f"extra_user_{os.urandom(3).hex()}"
        extra_plate = "EXTRA99AA"
        r_res = client.post("/api/auth/register", json={
            "username": extra_user,
            "password": "Password123!",
            "full_name": "Extra User"
        })
        extra_token = r_res.json()["access_token"]
        extra_headers = {"Authorization": f"Bearer {extra_token}"}

        p7_res = client.post("/api/bookings/pre-checkin", headers=extra_headers, json={
            "plate_number": extra_plate,
            "vehicle_type": "Car"
        })
        assert p7_res.status_code == 200

        # Attempt entry when parking is completely FULL
        e7_res = client.post("/api/detection/entry", data={
            "vehicle_type": "Car",
            "plate_number": extra_plate,
            "confidence": 0.95
        })
        assert e7_res.status_code == 200
        e7_data = e7_res.json()
        assert e7_data["status"] == "parking_full"
        assert e7_data["slot"] is None
        assert e7_data["trigger_buzzer"] is False
        assert "PARKING FULL" in e7_data["message"]

        # Clean up by resetting parking
        client.post("/api/parking/reset")
        print("Parking full capacity test PASSED successfully!")
    finally:
        db.close()


if __name__ == "__main__":
    test_full_auth_and_entry_lifecycle()
    test_parking_full_capacity()

