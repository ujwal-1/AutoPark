import threading
import re
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import select, and_
from app.models import ParkingSlot, ParkingSession, DetectionEvent, User, PreRegistration, utcnow, to_utc
from app.config import settings
import logging

logger = logging.getLogger("AutoPark.Allocator")

# Global thread lock for atomic slot allocation
allocation_lock = threading.Lock()

# Per-vehicle / per-plate memory cache for cooldown tracking (canonical_plate -> datetime)
recent_allocated_plates: Dict[str, datetime] = {}
recent_allocated_slots: Dict[str, str] = {}
last_exit_time: Optional[datetime] = None
last_allocated_slot: Optional[str] = None

def clear_cooldowns():
    global last_exit_time, last_allocated_slot
    with allocation_lock:
        recent_allocated_plates.clear()
        recent_allocated_slots.clear()
        last_exit_time = None
        last_allocated_slot = None

def canonicalize_plate(plate: str) -> str:
    """
    Normalizes common OCR character visual ambiguities (e.g. I/1, O/0, Z/2, S/5, B/8, G/6).
    Preserves alphanumeric characters in uppercase.
    """
    if not plate:
        return ""
    clean = re.sub(r'[^A-Z0-9]', '', plate.upper().strip())
    trans = str.maketrans({
        'I': '1', 'L': '1', 'J': '1',
        'O': '0', 'Q': '0', 'D': '0',
        'Z': '2',
        'S': '5',
        'B': '8',
        'G': '6'
    })
    return clean.translate(trans)

def levenshtein_distance(s1: str, s2: str) -> int:
    """Computes standard Levenshtein edit distance between two strings."""
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)
    prev = list(range(len(s2) + 1))
    for i, c1 in enumerate(s1):
        curr = [i + 1] * (len(s2) + 1)
        for j, c2 in enumerate(s2):
            insertions = prev[j + 1] + 1
            deletions = curr[j] + 1
            substitutions = prev[j] + (c1 != c2)
            curr[j + 1] = min(insertions, deletions, substitutions)
        prev = curr
    return prev[len(s2)]

def are_plates_similar(p1: Optional[str], p2: Optional[str]) -> bool:
    """
    Determines if two OCR plate readings represent the same vehicle plate.
    Handles OCR visual ambiguities (e.g. O/0, I/1, L/1, S/5, B/8, Z/2, G/6)
    and minor single-character edge dropouts without falsely merging distinct plates.
    """
    if not p1 or not p2:
        return False
    
    s1 = re.sub(r'[^A-Z0-9]', '', p1.upper().strip())
    s2 = re.sub(r'[^A-Z0-9]', '', p2.upper().strip())
    if not s1 or not s2:
        return False
    
    # 1. Exact string equality
    if s1 == s2:
        return True
        
    # 2. Canonicalized character equality (O/0, I/1, L/1, S/5, B/8, Z/2, G/6)
    c1 = canonicalize_plate(s1)
    c2 = canonicalize_plate(s2)
    if c1 == c2:
        return True
        
    min_len = min(len(c1), len(c2))
    max_len = max(len(c1), len(c2))
    len_diff = max_len - min_len
    
    # 3. Substring match for single character edge dropout/insertion
    if len_diff == 1 and min_len >= 3:
        if c1 in c2 or c2 in c1:
            return True

    return False

def is_plate_in_recent_cooldown(clean_plate: str, now: datetime, cooldown_seconds: int) -> tuple[bool, Optional[str]]:
    """
    Checks if this specific plate (or a canonically/fuzzy similar plate) was allocated recently.
    Does NOT block different vehicle plates.
    """
    # Clean up stale entries older than 120s
    stale_keys = [k for k, v in recent_allocated_plates.items() if (now - v).total_seconds() > 120]
    for k in stale_keys:
        recent_allocated_plates.pop(k, None)
        recent_allocated_slots.pop(k, None)

    canon = canonicalize_plate(clean_plate)
    for p_canon, alloc_time in list(recent_allocated_plates.items()):
        if canon == p_canon or are_plates_similar(clean_plate, p_canon):
            elapsed = (now - alloc_time).total_seconds()
            if elapsed < cooldown_seconds:
                return True, recent_allocated_slots.get(p_canon)
    return False, None

def find_matching_active_session(db: Session, plate_number: Optional[str]) -> Optional[ParkingSession]:
    """
    Searches active sessions in the database for a matching vehicle session.
    First checks exact plate match, then fuzzy OCR similarity.
    """
    active_sessions = db.query(ParkingSession).filter(ParkingSession.status == "ACTIVE").all()
    if not active_sessions:
        return None
        
    if not plate_number:
        return None
        
    clean_target = re.sub(r'[^A-Z0-9]', '', plate_number.upper().strip())
    if not clean_target:
        return None

    # Step 1: Check for exact plate matches
    for s in active_sessions:
        if s.plate_number:
            clean_s = re.sub(r'[^A-Z0-9]', '', s.plate_number.upper().strip())
            if clean_s == clean_target:
                return s

    # Step 2: Check for fuzzy OCR similarity
    for s in active_sessions:
        if s.plate_number and are_plates_similar(clean_target, s.plate_number):
            logger.info(f"Fuzzy OCR plate match: '{plate_number}' matched active session plate '{s.plate_number}'")
            return s

    return None

def find_matching_pending_booking(db: Session, plate_number: str) -> Optional[PreRegistration]:
    """
    Finds a PENDING_ARRIVAL pre-registration that matches the detected license plate
    (using exact, canonical, or fuzzy OCR similarity) and is not expired.
    """
    if not plate_number:
        return None

    clean_target = re.sub(r'[^A-Z0-9]', '', plate_number.upper().strip())
    if not clean_target:
        return None

    now = utcnow()
    pending_bookings = db.query(PreRegistration).filter(
        PreRegistration.status == "PENDING_ARRIVAL"
    ).all()

    # Expire outdated bookings and keep valid active ones
    valid_bookings = []
    for b in pending_bookings:
        if b.expires_at and to_utc(b.expires_at) < now:
            b.status = "EXPIRED"
            db.commit()
        else:
            valid_bookings.append(b)

    # 1. Exact clean match
    for b in valid_bookings:
        if b.plate_number:
            clean_b = re.sub(r'[^A-Z0-9]', '', b.plate_number.upper().strip())
            if clean_b == clean_target:
                return b

    # 2. Canonical / fuzzy OCR similarity match
    for b in valid_bookings:
        if b.plate_number and are_plates_similar(clean_target, b.plate_number):
            logger.info(f"Fuzzy OCR plate match for pre-registration: '{plate_number}' matched booking '{b.plate_number}'")
            return b

    return None

def init_slots_db(db: Session):
    """
    Ensure all default configured parking slots exist in the database (settings.SLOTS),
    and safely remove decommissioned slots that do not have active vehicle sessions.
    """
    clear_cooldowns()
    existing_slots = {slot.slot_number: slot for slot in db.query(ParkingSlot).all()}
    for slot_name in settings.SLOTS:
        if slot_name not in existing_slots:
            new_slot = ParkingSlot(slot_number=slot_name, status="AVAILABLE")
            db.add(new_slot)

    active_slot_ids = {
        s.slot_id for s in db.query(ParkingSession).filter(ParkingSession.status == "ACTIVE").all()
    }
    for slot_number, slot in list(existing_slots.items()):
        if slot_number not in settings.SLOTS:
            if slot.id in active_slot_ids:
                logger.warning(f"Preserving decommissioned slot {slot_number} because it has an active vehicle session.")
            else:
                logger.info(f"Removing decommissioned slot {slot_number} (enforcing {len(settings.SLOTS)}-slot capacity).")
                db.delete(slot)
    db.commit()

def allocate_entry_slot(
    db: Session,
    vehicle_type: str = "car",
    plate_number: Optional[str] = None,
    confidence: float = 0.95,
    bypass_cooldown: bool = False,
    candidates: Optional[List[Dict[str, Any]]] = None,
    evidence_data: Optional[Dict[str, Any]] = None
) -> dict:
    """
    Core Entry Allocation Logic with atomic locking, controlled pre-registration matching,
    unambiguous authorization gatekeeping, per-vehicle cooldown, and buzzer trigger determination.
    Rule: A slot is allocated ONLY when a vehicle has a reliable, unique match to an active pending pre-checkin.
    """
    global last_allocated_slot
    import json
    from app.anpr_pipeline import match_entry_pre_registration

    # Rule 1: Low YOLO confidence handling
    if confidence < settings.YOLO_CONFIDENCE_THRESHOLD:
        logger.info(f"Low confidence entry detection ignored: {confidence} < {settings.YOLO_CONFIDENCE_THRESHOLD}")
        return {
            "status": "ignored",
            "message": f"Confidence {confidence*100:.1f}% below threshold ({settings.YOLO_CONFIDENCE_THRESHOLD*100:.1f}%)",
            "slot": None,
            "trigger_buzzer": False,
            "confidence": confidence,
            "plate_number": plate_number
        }

    # Prepare candidate list
    eval_candidates: List[Dict[str, Any]] = []
    if candidates and len(candidates) > 0:
        eval_candidates = list(candidates)
    elif plate_number:
        clean = re.sub(r'[^A-Z0-9]', '', plate_number.upper().strip())
        if len(clean) >= 4:
            eval_candidates = [{
                "text": clean,
                "canonical": canonicalize_plate(clean),
                "confidence": confidence,
                "votes": 1
            }]

    # Rule 2: Strict Plate Requirement - Minimum 4 alphanumeric characters
    if not eval_candidates:
        logger.info(f"Entry detection without valid license plate candidate (plate='{plate_number}') ignored for slot allocation (vehicle: {vehicle_type})")
        event = DetectionEvent(
            camera="ENTRY",
            vehicle_type=vehicle_type,
            plate_number=None,
            confidence=confidence,
            processed=True,
            allocated_slot_number=None,
            evidence=json.dumps(evidence_data, default=str) if evidence_data else None,
            diagnostic_info="No valid plate candidate recognized"
        )
        db.add(event)
        db.commit()
        return {
            "status": "no_plate",
            "message": "Vehicle detected but no valid license plate recognized (minimum 4 alphanumeric characters required).",
            "slot": None,
            "trigger_buzzer": False,
            "confidence": confidence,
            "plate_number": None
        }

    primary_candidate_text = eval_candidates[0]["text"]
    clean_plate = primary_candidate_text

    with allocation_lock:
        now = utcnow()
        canon_plate = canonicalize_plate(clean_plate)
        
        # Rule 3: Check if a vehicle with this plate (or similar OCR reading) already has an active session
        active_session = find_matching_active_session(db, clean_plate)

        if active_session:
            slot = db.query(ParkingSlot).filter(ParkingSlot.id == active_session.slot_id).first()
            slot_name = slot.slot_number if slot else "Unknown"
            recent_allocated_plates[canon_plate] = now
            recent_allocated_slots[canon_plate] = slot_name
            last_allocated_slot = slot_name
            logger.info(f"Duplicate frame ignored: Vehicle [{clean_plate}] already actively allocated to slot {slot_name}.")
            return {
                "status": "already_allocated",
                "message": f"Vehicle [{clean_plate}] already allocated to slot {slot_name}",
                "slot": slot_name,
                "trigger_buzzer": False,
                "confidence": confidence,
                "plate_number": active_session.plate_number or clean_plate
            }

        # Rule 4: Per-vehicle / per-plate cooldown check
        if not bypass_cooldown:
            in_cooldown, cooldown_slot = is_plate_in_recent_cooldown(clean_plate, now, settings.DETECTION_COOLDOWN_SECONDS)
            if in_cooldown and cooldown_slot:
                logger.info(f"Vehicle plate [{clean_plate}] debounced within {settings.DETECTION_COOLDOWN_SECONDS}s cooldown for slot {cooldown_slot}.")
                return {
                    "status": "already_allocated",
                    "message": f"Vehicle [{clean_plate}] recently allocated to slot {cooldown_slot}. Repeated frame ignored.",
                    "slot": cooldown_slot,
                    "trigger_buzzer": False,
                    "confidence": confidence,
                    "plate_number": clean_plate
                }

        # Rule 5: Controlled Pre-Registration Matching
        match_result = match_entry_pre_registration(eval_candidates, db)

        if match_result["status"] == "ambiguous":
            logger.warning(f"Ambiguous Pre-Booking Match: {match_result['reason']}")
            event = DetectionEvent(
                camera="ENTRY",
                vehicle_type=vehicle_type,
                plate_number=clean_plate,
                confidence=match_result.get("confidence", confidence),
                processed=True,
                allocated_slot_number=None,
                evidence=json.dumps(evidence_data, default=str) if evidence_data else None,
                diagnostic_info=match_result["reason"]
            )
            db.add(event)
            db.commit()
            return {
                "status": "ambiguous",
                "message": match_result["reason"],
                "slot": None,
                "trigger_buzzer": False,
                "confidence": match_result.get("confidence", confidence),
                "plate_number": clean_plate
            }

        if match_result["status"] != "authorized":
            logger.warning(f"Unauthorized Entry Attempt: Vehicle [{clean_plate}] is not pre-registered.")
            event = DetectionEvent(
                camera="ENTRY",
                vehicle_type=vehicle_type,
                plate_number=clean_plate,
                confidence=confidence,
                processed=True,
                allocated_slot_number=None,
                evidence=json.dumps(evidence_data, default=str) if evidence_data else None,
                diagnostic_info="Unauthorized - No valid pre-check-in found"
            )
            db.add(event)
            db.commit()
            return {
                "status": "unauthorized",
                "message": f"Access Denied: Vehicle [{clean_plate}] is not pre-registered. Please log in on the dashboard and submit a pre-check-in before entering.",
                "slot": None,
                "trigger_buzzer": False,
                "open_barrier": False,
                "barrier_action": "LOCKED",
                "confidence": confidence,
                "plate_number": clean_plate
            }

        pending_booking = match_result["matched_booking"]
        confirmed_plate = match_result["confirmed_plate"]

        # Check if pending booking already has a pre-allocated or reserved bay
        assigned_slot = None
        if pending_booking.slot_id:
            preferred_slot = db.query(ParkingSlot).filter(ParkingSlot.id == pending_booking.slot_id).first()
            if preferred_slot and preferred_slot.status in ["AVAILABLE", "ALLOCATED"]:
                assigned_slot = preferred_slot
                logger.info(f"Assigning pre-booked Bay {assigned_slot.slot_number} (ID {assigned_slot.id}) for plate {confirmed_plate}")

        if not assigned_slot:
            # Query available slots ordered by name (A1, A2, A3...)
            available_slots = db.query(ParkingSlot).filter(
                ParkingSlot.status == "AVAILABLE"
            ).order_by(ParkingSlot.slot_number.asc()).all()

            if not available_slots:
                logger.warning("Entry attempt failed: PARKING FULL")
                event = DetectionEvent(
                    camera="ENTRY",
                    vehicle_type=vehicle_type,
                    plate_number=confirmed_plate,
                    confidence=confidence,
                    processed=True,
                    allocated_slot_number=None,
                    evidence=json.dumps(evidence_data, default=str) if evidence_data else None,
                    diagnostic_info="Parking full"
                )
                db.add(event)
                db.commit()
                return {
                    "status": "parking_full",
                    "message": "PARKING FULL: No available slots",
                    "slot": None,
                    "trigger_buzzer": False,
                    "confidence": confidence,
                    "plate_number": confirmed_plate
                }

            # Atomically assign the first available slot
            assigned_slot = available_slots[0]

        assigned_slot.status = "ALLOCATED"
        assigned_slot.updated_at = now

        # Update pre-registration to CHECKED_IN
        pending_booking.status = "CHECKED_IN"
        pending_booking.slot_id = assigned_slot.id
        pending_booking.checked_in_at = now

        # Prepare evidence JSON
        evidence_dict = {
            "confirmed_plate": confirmed_plate,
            "detected_candidates": eval_candidates[:5],
            "confidence": match_result["confidence"],
            "camera": "ENTRY",
            "timestamp": now.isoformat(),
            "booking_id": pending_booking.id,
            "driver_id": pending_booking.user_id,
            "quality": evidence_data.get("quality") if evidence_data else None
        }
        evidence_json = json.dumps(evidence_dict, default=str)

        # Create active parking session linked to user, booking, and evidence
        session = ParkingSession(
            vehicle_type=pending_booking.vehicle_type or vehicle_type,
            plate_number=confirmed_plate,
            slot_id=assigned_slot.id,
            user_id=pending_booking.user_id,
            booking_id=pending_booking.id,
            entry_time=now,
            status="ACTIVE",
            recognition_evidence=evidence_json
        )
        db.add(session)

        # Record detection event
        event = DetectionEvent(
            camera="ENTRY",
            vehicle_type=vehicle_type,
            plate_number=confirmed_plate,
            confidence=confidence,
            processed=True,
            allocated_slot_number=assigned_slot.slot_number,
            evidence=evidence_json,
            diagnostic_info=f"Authorized pre-checkin for slot {assigned_slot.slot_number}"
        )
        db.add(event)

        db.commit()

        # Update per-vehicle cooldown state
        recent_allocated_plates[canon_plate] = now
        recent_allocated_slots[canon_plate] = assigned_slot.slot_number
        last_allocated_slot = assigned_slot.slot_number

        driver_label = pending_booking.user.full_name or pending_booking.user.username if pending_booking.user else "Driver"
        logger.info(f"Authorized Entry: Slot {assigned_slot.slot_number} successfully allocated for {driver_label} (Confirmed Plate: {confirmed_plate})")

        return {
            "status": "allocated",
            "message": f"Welcome {driver_label}! Slot {assigned_slot.slot_number} successfully assigned to [{confirmed_plate}]. Entry boom barrier opened.",
            "slot": assigned_slot.slot_number,
            "trigger_buzzer": True,
            "open_barrier": True,
            "barrier_action": "OPEN",
            "confidence": confidence,
            "plate_number": confirmed_plate,
            "user_id": pending_booking.user_id,
            "booking_id": pending_booking.id,
            "driver_name": driver_label
        }

def release_exit_slot(
    db: Session,
    vehicle_type: str = "car",
    plate_number: Optional[str] = None,
    confidence: float = 0.95,
    candidates: Optional[List[Dict[str, Any]]] = None,
    evidence_data: Optional[Dict[str, Any]] = None
) -> dict:
    """
    Core Exit Release Logic using shared ANPR/OCR pipeline and controlled matching:
    Rules:
    - Exit camera has NO buzzer!
    - Controlled matching against active parking sessions and their confirmed entry plates.
    - If match is ambiguous, request another capture / verification (NO false release!).
    - Never release slots blindly or fall back to oldest session.
    - Releases ONLY the slot belonging to the confirmed active session.
    """
    global last_exit_time
    import json
    from app.anpr_pipeline import match_exit_active_session

    if confidence < settings.YOLO_CONFIDENCE_THRESHOLD:
        logger.info(f"Low confidence exit detection ignored: {confidence}")
        return {
            "status": "ignored",
            "message": f"Exit confidence {confidence*100:.1f}% below threshold",
            "slot": None,
            "trigger_buzzer": False,
            "confidence": confidence,
            "plate_number": plate_number
        }

    # Prepare candidate list
    eval_candidates: List[Dict[str, Any]] = []
    if candidates and len(candidates) > 0:
        eval_candidates = list(candidates)
    elif plate_number:
        clean = re.sub(r'[^A-Z0-9]', '', plate_number.upper().strip())
        if len(clean) >= 3:
            eval_candidates = [{
                "text": clean,
                "canonical": canonicalize_plate(clean),
                "confidence": confidence,
                "votes": 1
            }]

    with allocation_lock:
        now = utcnow()

        # Controlled Matching against active sessions
        match_result = match_exit_active_session(eval_candidates, db)

        if match_result["status"] == "no_candidates":
            logger.info("Exit detection ignored: No readable license plate candidates.")
            return {
                "status": "no_plate",
                "message": "Exit camera could not extract readable license plate characters.",
                "slot": None,
                "trigger_buzzer": False,
                "confidence": confidence,
                "plate_number": None
            }

        if match_result["status"] == "ambiguous":
            logger.warning(f"Ambiguous Exit Match: {match_result['reason']}")
            return {
                "status": "ambiguous",
                "message": match_result["reason"],
                "slot": None,
                "trigger_buzzer": False,
                "confidence": match_result.get("confidence", confidence),
                "plate_number": match_result.get("confirmed_plate")
            }

        if match_result["status"] != "matched":
            logger.info(f"Exit detection ignored: {match_result['reason']}")
            return {
                "status": "no_active_session",
                "message": match_result["reason"],
                "slot": None,
                "trigger_buzzer": False,
                "confidence": confidence,
                "plate_number": match_result.get("confirmed_plate") or plate_number
            }

        active_session = match_result["matched_session"]
        confirmed_plate = match_result["confirmed_plate"]

        # Debouncing exit requests
        if last_exit_time is not None:
            elapsed = (now - last_exit_time).total_seconds()
            if elapsed < settings.DETECTION_COOLDOWN_SECONDS:
                logger.info(f"Debounced exit detection within {elapsed:.1f}s cooldown window.")
                return {
                    "status": "debounced",
                    "message": "Exit detection debounced.",
                    "slot": None,
                    "trigger_buzzer": False,
                    "confidence": confidence,
                    "plate_number": confirmed_plate
                }

        # Complete the active session
        active_session.status = "COMPLETED"
        active_session.exit_time = now

        # Also complete linked pre-registration if present
        if active_session.booking_id:
            booking = db.query(PreRegistration).filter(PreRegistration.id == active_session.booking_id).first()
            if booking and booking.status == "CHECKED_IN":
                booking.status = "COMPLETED"

        # Release ONLY the slot belonging to this confirmed active session
        slot = db.query(ParkingSlot).filter(ParkingSlot.id == active_session.slot_id).first()
        released_slot_name = "Unknown"
        if slot:
            slot.status = "AVAILABLE"
            slot.updated_at = now
            released_slot_name = slot.slot_number

        # Clear from recent plates cache if matched
        if confirmed_plate:
            canon = canonicalize_plate(confirmed_plate)
            recent_allocated_plates.pop(canon, None)
            recent_allocated_slots.pop(canon, None)

        # Prepare evidence JSON
        exit_evidence_dict = {
            "confirmed_plate": confirmed_plate,
            "session_id": active_session.id,
            "released_slot": released_slot_name,
            "candidates": eval_candidates[:5],
            "confidence": match_result["confidence"],
            "camera": "EXIT",
            "timestamp": now.isoformat()
        }
        evidence_json = json.dumps(exit_evidence_dict, default=str)

        # Log event
        event = DetectionEvent(
            camera="EXIT",
            vehicle_type=active_session.vehicle_type or vehicle_type,
            plate_number=confirmed_plate,
            confidence=confidence,
            processed=True,
            allocated_slot_number=released_slot_name,
            evidence=evidence_json,
            diagnostic_info=f"Released slot {released_slot_name} for session {active_session.id}"
        )
        db.add(event)

        db.commit()

        last_exit_time = now

        logger.info(f"Slot {released_slot_name} released upon exit detection for confirmed session plate {confirmed_plate}.")

        # Calculate duration and billing details
        duration_seconds = max(0, int((now - to_utc(active_session.entry_time)).total_seconds())) if active_session.entry_time else 0
        duration_minutes = max(1, duration_seconds // 60)
        hrs = duration_minutes // 60
        mins = duration_minutes % 60
        duration_formatted = f"{hrs}h {mins}m" if hrs > 0 else f"{mins}m"
        billed_amount = 30 if duration_minutes <= 60 else 30 + ((duration_minutes - 1) // 60) * 20

        return {
            "status": "released",
            "message": f"Slot {released_slot_name} released successfully for [{confirmed_plate}]. Exit boom barrier opened.",
            "slot": released_slot_name,
            "trigger_buzzer": False,
            "open_barrier": True,
            "barrier_action": "OPEN",
            "confidence": confidence,
            "plate_number": confirmed_plate,
            "session_id": active_session.id,
            "duration_minutes": duration_minutes,
            "duration_formatted": duration_formatted,
            "billed_amount": billed_amount,
            "entry_time": active_session.entry_time.isoformat() if active_session.entry_time else None,
            "exit_time": now.isoformat()
        }

def reset_all_parking_demo(db: Session) -> dict:
    """
    College Demonstration Reset:
    Sets all slots (A1-A3, B1-B3) to AVAILABLE, marks all active sessions as COMPLETED,
    and clears all in-memory allocator/cooldown states.
    Preserves all historical sessions and detection events without deleting any data.
    """
    global last_exit_time, last_allocated_slot
    with allocation_lock:
        now = utcnow()
        
        # 1. Mark every ACTIVE ParkingSession as COMPLETED with exit_time
        active_sessions = db.query(ParkingSession).filter(ParkingSession.status == "ACTIVE").all()
        for session in active_sessions:
            session.status = "COMPLETED"
            if not session.exit_time:
                session.exit_time = now

        # Also complete or cancel pending/checked-in bookings
        active_bookings = db.query(PreRegistration).filter(
            PreRegistration.status.in_(["CHECKED_IN", "PENDING_ARRIVAL"])
        ).all()
        for b in active_bookings:
            b.status = "COMPLETED" if b.status == "CHECKED_IN" else "CANCELLED"

        # 2. Ensure all configured slots exist and are set to AVAILABLE
        existing_slots = {slot.slot_number: slot for slot in db.query(ParkingSlot).all()}
        for slot_name in settings.SLOTS:
            if slot_name in existing_slots:
                slot = existing_slots[slot_name]
                slot.status = "AVAILABLE"
                slot.updated_at = now
            else:
                new_slot = ParkingSlot(slot_number=slot_name, status="AVAILABLE", updated_at=now)
                db.add(new_slot)

        # Remove any decommissioned slots that are not in settings.SLOTS
        for slot in existing_slots.values():
            if slot.slot_number not in settings.SLOTS:
                db.delete(slot)

        db.commit()

        # 3. Clear allocator/debounce in-memory state
        recent_allocated_plates.clear()
        recent_allocated_slots.clear()
        last_exit_time = None
        last_allocated_slot = None

        logger.info("Demo state reset: All slots set to AVAILABLE, active sessions completed, memory cleared.")
        return {"status": "success", "message": "All parking slots reset to AVAILABLE"}

def manual_release_slot_by_number(db: Session, slot_number: str) -> dict:
    """
    Manual override action to release a specific slot.
    """
    with allocation_lock:
        now = utcnow()
        slot = db.query(ParkingSlot).filter(ParkingSlot.slot_number == slot_number).first()
        if not slot:
            return {"status": "error", "message": f"Slot {slot_number} not found"}

        slot.status = "AVAILABLE"
        slot.updated_at = now

        # Complete associated active session if any
        active_session = db.query(ParkingSession).filter(
            ParkingSession.slot_id == slot.id,
            ParkingSession.status == "ACTIVE"
        ).first()

        if active_session:
            active_session.status = "COMPLETED"
            active_session.exit_time = now
            if active_session.plate_number:
                canon = canonicalize_plate(active_session.plate_number)
                recent_allocated_plates.pop(canon, None)
                recent_allocated_slots.pop(canon, None)

        db.commit()

        logger.info(f"Slot {slot_number} manually released.")
        return {"status": "success", "message": f"Slot {slot_number} released manually", "slot": slot_number}
