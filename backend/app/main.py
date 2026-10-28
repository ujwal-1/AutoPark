from fastapi import FastAPI, Depends, UploadFile, File, Form, HTTPException, WebSocket, WebSocketDisconnect, BackgroundTasks, status
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
import asyncio
import threading
import json
import logging
import re
from typing import Optional

from app.database import get_db, engine, Base, run_migrations, SessionLocal
from app.models import ParkingSlot, ParkingSession, DetectionEvent, User, PreRegistration, utcnow, to_utc
from app.config import settings
from app.schemas import (
    DetectionRequest,
    DetectionResponse,
    SummaryResponse,
    UserRegisterRequest,
    UserLoginRequest,
    UserResponse,
    TokenResponse,
    PreCheckinRequest,
    PreCheckinResponse,
    ParkingHistoryItem,
    MyStatusResponse
)
from app.auth import hash_password, verify_password, create_access_token, get_current_user, get_optional_current_user
from app.yolov11_detector import yolov11_detector_engine as detector_engine
from app.slot_allocator import (
    init_slots_db,
    allocate_entry_slot,
    release_exit_slot,
    reset_all_parking_demo,
    manual_release_slot_by_number,
    are_plates_similar,
    canonicalize_plate
)
from app.websocket_manager import ws_manager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("AutoPark.Main")

# Async lock: guarantees only ONE heavy YOLO + EasyOCR job runs at a time without blocking the asyncio event loop
anpr_lock = asyncio.Lock()

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Camera-Based Smart Parking System with Real-Time Monitoring",
    version="1.0.0"
)

# Enable CORS for local Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_event():
    # 1. Run idempotent schema migrations (adds plate_number if missing)
    run_migrations()
    
    # 2. Verify parking slots exist
    db = next(get_db())
    try:
        init_slots_db(db)
        logger.info("Database initialized and parking slots verified.")
    finally:
        db.close()

    # 3. Pre-warm both YOLO plate model and EasyOCR reader in background thread
    def warmup_models():
        try:
            logger.info("Initializing and pre-warming AI models (YOLO + EasyOCR)...")
            detector_engine.warmup()
            logger.info("✅ All AI models warmed up and ready for camera frame ingestion.")
        except Exception as e:
            logger.warning(f"Model warmup warning: {e}")

    threading.Thread(target=warmup_models, daemon=True, name="AI-Model-Warmup").start()

@app.get("/")
def read_root():
    return {
        "status": "online",
        "system": settings.PROJECT_NAME,
        "slots": settings.SLOTS,
        "health": "/health"
    }

@app.get("/health")
@app.get("/api/health")
def health_check(db: Session = Depends(get_db)):
    """
    Lightweight health and readiness check for:
    1. API server availability
    2. AI model readiness (YOLO plate model and EasyOCR)
    3. Database connectivity and slot metrics
    Executes instantly without running any heavy model inference.
    """
    db_connected = False
    slots_total = 0
    slots_available = 0
    active_sessions = 0
    try:
        slots_total = db.query(ParkingSlot).count()
        slots_available = db.query(ParkingSlot).filter(ParkingSlot.status == "AVAILABLE").count()
        active_sessions = db.query(ParkingSession).filter(ParkingSession.status == "ACTIVE").count()
        db_connected = True
    except Exception as e:
        logger.error(f"Database health check error: {e}")

    plate_model_ready = detector_engine.plate_model is not None
    from app.yolo_detector import YOLODetector
    easyocr_ready = YOLODetector._easyocr_reader is not None

    return {
        "status": "healthy" if db_connected and plate_model_ready else "degraded",
        "api": "online",
        "database": "connected" if db_connected else "disconnected",
        "models": {
            "yolo_plate_model": plate_model_ready,
            "easyocr": easyocr_ready
        },
        "metrics": {
            "slots_total": slots_total,
            "slots_available": slots_available,
            "active_sessions": active_sessions
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

class FrameProcessor:
    """
    Dedicated background frame runner that prevents queue backlog.
    Always prefers and processes the newest frame; unstarted older frames are discarded.
    """
    def __init__(self, camera_name: str):
        self.camera_name = camera_name
        self._pending_frame = None  # (image_bytes, vehicle_type, plate_number, timestamp)
        self._lock = threading.Lock()
        self._is_running = False

    def submit_frame(self, image_bytes: bytes, vehicle_type: str = "Car", fallback_plate: Optional[str] = None):
        with self._lock:
            # Always overwrite with newest frame (drops any older unstarted frames)
            self._pending_frame = (image_bytes, vehicle_type, fallback_plate, datetime.now())
            if not self._is_running:
                self._is_running = True
                asyncio.create_task(self._worker_loop())

    async def _worker_loop(self):
        while True:
            frame_data = None
            with self._lock:
                if self._pending_frame is None:
                    self._is_running = False
                    break
                frame_data = self._pending_frame
                self._pending_frame = None

            image_bytes, vehicle_type, fallback_plate, frame_time = frame_data
            
            # Check frame freshness (drop if unstarted frame has aged > 6 seconds)
            age_sec = (datetime.now() - frame_time).total_seconds()
            if age_sec > 6.0:
                logger.info(f"[{self.camera_name}] Dropping stale frame older than {age_sec:.1f}s.")
                continue

            try:
                if self.camera_name == "ENTRY":
                    await self._process_entry(image_bytes, vehicle_type, fallback_plate)
                else:
                    await self._process_exit(image_bytes, vehicle_type, fallback_plate)
            except Exception as e:
                logger.error(f"[{self.camera_name}] Error in background ANPR processing: {e}", exc_info=True)

    async def _process_entry(self, image_bytes: bytes, vehicle_type: str, fallback_plate: Optional[str]) -> dict:
        logger.info(f"[CAMERA: ENTRY] Starting ANPR inference on frame ({len(image_bytes)} bytes)...")
        async with anpr_lock:
            det_result = await asyncio.to_thread(detector_engine.process_image, image_bytes, "ENTRY")

        width = det_result.get("width", 0)
        height = det_result.get("height", 0)
        plate_detected = det_result.get("plate_detected", False)
        plate_bbox = det_result.get("plate_bbox")

        if not det_result.get("detected") or not plate_detected:
            fail_stage = det_result.get("failure_stage", "camera_quality")
            err_msg = det_result.get("error") or "No license plate recognized in frame"
            logger.info(
                f"[CAMERA: ENTRY] Dims: {width}x{height} | Plates Detected: 0 | Plate BBox: None | "
                f"OCR Candidates: [] | Conf: 0.000 | Result: no_plate | Stage: {fail_stage}"
            )
            await ws_manager.broadcast({
                "type": "vehicle.detected",
                "data": {
                    "camera": "ENTRY",
                    "detected": False,
                    "confidence": det_result.get("confidence", 0.0),
                    "failure_stage": fail_stage,
                    "message": err_msg
                }
            })
            return {
                "status": "no_plate",
                "message": err_msg,
                "slot": None,
                "trigger_buzzer": False,
                "confidence": det_result.get("confidence", 0.0),
                "plate_number": None,
                "vehicle_type": det_result.get("vehicle_type", vehicle_type),
                "camera": "ENTRY"
            }

        from app.anpr_pipeline import entry_accumulator
        burst_reading = entry_accumulator.get_consolidated_reading()

        candidates = burst_reading["candidates"] if burst_reading["has_reading"] else det_result.get("candidates", [])
        det_confidence = det_result["confidence"] or 0.947
        veh_type = det_result.get("vehicle_type") or vehicle_type
        det_plate = det_result.get("plate_number") or fallback_plate

        if burst_reading["has_reading"] and burst_reading["candidates"]:
            top_burst = burst_reading["candidates"][0]
            det_plate = top_burst["text"]
            det_confidence = max(det_confidence, top_burst["confidence"])

        db = SessionLocal()
        try:
            res = allocate_entry_slot(
                db=db,
                vehicle_type=veh_type,
                plate_number=det_plate,
                confidence=det_confidence,
                candidates=candidates,
                evidence_data=det_result
            )

            logger.info(
                f"[CAMERA: ENTRY] Dims: {width}x{height} | Plates Detected: 1 | Plate BBox: {plate_bbox} | "
                f"OCR Candidates: {[c['text'] for c in candidates]} | Conf: {det_confidence:.3f} | "
                f"Final Plate: {res.get('plate_number') or det_plate} | Result: {res['status']} | "
                f"Slot: {res.get('slot')} | Buzzer: {res.get('trigger_buzzer')}"
            )

            if res["status"] in ["allocated", "already_allocated"]:
                await ws_manager.broadcast({
                    "type": "slot.allocated",
                    "data": {
                        "slot": res["slot"],
                        "vehicle": veh_type,
                        "plate_number": res.get("plate_number") or det_plate,
                        "confidence": res["confidence"],
                        "status": res["status"],
                        "trigger_buzzer": res["trigger_buzzer"],
                        "driver_name": res.get("driver_name")
                    }
                })
                if res["trigger_buzzer"]:
                    await ws_manager.broadcast({
                        "type": "buzzer.triggered",
                        "data": {
                            "camera": "ENTRY",
                            "slot": res["slot"],
                            "plate_number": res.get("plate_number") or det_plate,
                            "message": f"Buzzer beeped for slot assignment ({res['slot']})"
                        }
                    })
            elif res["status"] == "parking_full":
                await ws_manager.broadcast({
                    "type": "parking.full",
                    "data": {
                        "message": "All parking slots are fully occupied!"
                    }
                })
            elif res["status"] == "unauthorized":
                await ws_manager.broadcast({
                    "type": "entry.unauthorized",
                    "data": {
                        "camera": "ENTRY",
                        "detected": True,
                        "confidence": res["confidence"],
                        "plate_number": res.get("plate_number") or det_plate,
                        "vehicle": veh_type,
                        "message": res["message"]
                    }
                })
            elif res["status"] == "ambiguous":
                await ws_manager.broadcast({
                    "type": "entry.unauthorized",
                    "data": {
                        "camera": "ENTRY",
                        "detected": True,
                        "confidence": res["confidence"],
                        "plate_number": res.get("plate_number") or det_plate,
                        "vehicle": veh_type,
                        "message": f"Ambiguous match: {res['message']}"
                    }
                })
            elif res["status"] == "no_plate":
                await ws_manager.broadcast({
                    "type": "vehicle.detected",
                    "data": {
                        "camera": "ENTRY",
                        "detected": True,
                        "confidence": res["confidence"],
                        "message": "Vehicle detected but license plate not readable across image variants."
                    }
                })
            return res
        finally:
            db.close()

    async def _process_exit(self, image_bytes: bytes, vehicle_type: str, fallback_plate: Optional[str]) -> dict:
        logger.info(f"[CAMERA: EXIT] Starting ANPR inference on frame ({len(image_bytes)} bytes)...")
        async with anpr_lock:
            det_result = await asyncio.to_thread(detector_engine.process_image, image_bytes, "EXIT")

        width = det_result.get("width", 0)
        height = det_result.get("height", 0)
        plate_detected = det_result.get("plate_detected", False)
        plate_bbox = det_result.get("plate_bbox")

        if not det_result.get("detected") or not plate_detected:
            fail_stage = det_result.get("failure_stage", "camera_quality")
            err_msg = det_result.get("error") or "No license plate recognized in exit frame"
            logger.info(
                f"[CAMERA: EXIT] Dims: {width}x{height} | Plates Detected: 0 | Plate BBox: None | "
                f"OCR Candidates: [] | Conf: 0.000 | Result: no_plate | Stage: {fail_stage}"
            )
            await ws_manager.broadcast({
                "type": "vehicle.detected",
                "data": {
                    "camera": "EXIT",
                    "detected": False,
                    "confidence": det_result.get("confidence", 0.0),
                    "failure_stage": fail_stage,
                    "message": err_msg
                }
            })
            return {
                "status": "no_plate",
                "message": err_msg,
                "slot": None,
                "trigger_buzzer": False,
                "confidence": det_result.get("confidence", 0.0),
                "plate_number": None,
                "vehicle_type": det_result.get("vehicle_type", vehicle_type),
                "camera": "EXIT"
            }

        from app.anpr_pipeline import exit_accumulator
        burst_reading = exit_accumulator.get_consolidated_reading()

        candidates = burst_reading["candidates"] if burst_reading["has_reading"] else det_result.get("candidates", [])
        det_confidence = det_result["confidence"] or 0.921
        veh_type = det_result.get("vehicle_type") or vehicle_type
        det_plate = det_result.get("plate_number") or fallback_plate

        if burst_reading["has_reading"] and burst_reading["candidates"]:
            top_burst = burst_reading["candidates"][0]
            det_plate = top_burst["text"]
            det_confidence = max(det_confidence, top_burst["confidence"])

        db = SessionLocal()
        try:
            res = release_exit_slot(
                db=db,
                vehicle_type=veh_type,
                plate_number=det_plate,
                confidence=det_confidence,
                candidates=candidates,
                evidence_data=det_result
            )

            logger.info(
                f"[CAMERA: EXIT] Dims: {width}x{height} | Plates Detected: 1 | Plate BBox: {plate_bbox} | "
                f"OCR Candidates: {[c['text'] for c in candidates]} | Conf: {det_confidence:.3f} | "
                f"Final Plate: {res.get('plate_number') or det_plate} | Result: {res['status']} | "
                f"Released Slot: {res.get('slot')}"
            )

            if res["status"] == "released":
                await ws_manager.broadcast({
                    "type": "slot.released",
                    "data": {
                        "slot": res["slot"],
                        "vehicle": veh_type,
                        "plate_number": res.get("plate_number") or det_plate,
                        "confidence": res["confidence"]
                    }
                })
                await ws_manager.broadcast({
                    "type": "vehicle.exited",
                    "data": {
                        "slot": res["slot"],
                        "vehicle": veh_type,
                        "plate_number": res.get("plate_number") or det_plate
                    }
                })
            elif res["status"] == "ambiguous":
                logger.warning(f"[EXIT CAMERA] Ambiguous active session match: {res['message']}")
                await ws_manager.broadcast({
                    "type": "exit.ambiguous",
                    "data": {
                        "camera": "EXIT",
                        "slot": None,
                        "plate_number": det_plate,
                        "message": res["message"]
                    }
                })
            elif res["status"] == "no_active_session":
                logger.info(f"[EXIT CAMERA] No active session matches exit reading: {res['message']}")
                await ws_manager.broadcast({
                    "type": "exit.no_session",
                    "data": {
                        "camera": "EXIT",
                        "slot": None,
                        "plate_number": det_plate,
                        "message": res["message"]
                    }
                })
            return res
        finally:
            db.close()

entry_frame_processor = FrameProcessor("ENTRY")
exit_frame_processor = FrameProcessor("EXIT")


@app.post("/api/detection/entry", response_model=DetectionResponse)
async def detect_entry(
    file: UploadFile = File(None),
    vehicle_type: str = Form("Car"),
    plate_number: str = Form(None),
    confidence: float = Form(None),
    sync: bool = True,
    db: Session = Depends(get_db)
):
    """
    Entry Camera Endpoint.
    Receives multipart JPEG frame from Entry ESP32-CAM (or direct simulation payload).
    Executes ANPR pipeline, validates pre-checkin authorization,
    allocates parking slot, triggers buzzer, broadcasts over WebSocket,
    and returns explicit status (allocated / unauthorized / no_plate / already_allocated).
    """
    if file is not None:
        image_bytes = await file.read()
        if not image_bytes or len(image_bytes) == 0:
            return DetectionResponse(
                status="no_plate",
                message="Uploaded frame is empty",
                slot=None,
                trigger_buzzer=False,
                confidence=0.0,
                camera="ENTRY",
                vehicle_type=vehicle_type,
                plate_number=None
            )
        try:
            logger.info(f"[CAMERA: ENTRY] Frame received ({len(image_bytes)} bytes, vehicle_type='{vehicle_type}', plate='{plate_number}')")
            res = await entry_frame_processor._process_entry(image_bytes, vehicle_type, plate_number)
            return DetectionResponse(
                status=res.get("status", "no_plate"),
                message=res.get("message", "Frame processed"),
                slot=res.get("slot"),
                trigger_buzzer=res.get("trigger_buzzer", False),
                confidence=res.get("confidence", 1.0),
                camera="ENTRY",
                vehicle_type=res.get("vehicle_type", vehicle_type),
                plate_number=res.get("plate_number")
            )
        except Exception as e:
            logger.error(f"[CAMERA: ENTRY] Error during entry frame processing: {e}", exc_info=True)
            return DetectionResponse(
                status="no_plate",
                message=f"Processing exception: {str(e)}",
                slot=None,
                trigger_buzzer=False,
                confidence=0.0,
                camera="ENTRY",
                vehicle_type=vehicle_type,
                plate_number=None
            )

    logger.info(f"[CAMERA: ENTRY] Direct API request received (no file, vehicle_type='{vehicle_type}', plate='{plate_number}', sync={sync})")

    # Synchronous path for direct plate/API requests (no file uploaded)
    det_confidence = confidence if confidence is not None else 0.947
    det_plate = plate_number

    res = allocate_entry_slot(
        db=db,
        vehicle_type=vehicle_type,
        plate_number=det_plate,
        confidence=det_confidence
    )
    logger.info(f"[CAMERA: ENTRY] Direct request handled: status='{res['status']}', slot='{res.get('slot')}', plate='{res.get('plate_number')}'")

    if res["status"] in ["allocated", "already_allocated"]:
        await ws_manager.broadcast({
            "type": "slot.allocated",
            "data": {
                "slot": res["slot"],
                "vehicle": vehicle_type,
                "plate_number": res.get("plate_number") or det_plate,
                "confidence": res["confidence"],
                "status": res["status"],
                "trigger_buzzer": res["trigger_buzzer"]
            }
        })
        if res["trigger_buzzer"]:
            await ws_manager.broadcast({
                "type": "buzzer.triggered",
                "data": {
                    "camera": "ENTRY",
                    "slot": res["slot"],
                    "plate_number": res.get("plate_number") or det_plate,
                    "message": f"Buzzer beeped for slot assignment ({res['slot']})"
                }
            })
    elif res["status"] == "parking_full":
        await ws_manager.broadcast({
            "type": "parking.full",
            "data": {
                "message": "All parking slots are fully occupied!"
            }
        })
    elif res["status"] == "unauthorized":
        await ws_manager.broadcast({
            "type": "entry.unauthorized",
            "data": {
                "camera": "ENTRY",
                "detected": True,
                "confidence": res["confidence"],
                "plate_number": res.get("plate_number") or det_plate,
                "vehicle": vehicle_type,
                "message": res["message"]
            }
        })

    if res["status"] in ["allocated", "already_allocated"]:
        if res.get("open_barrier"):
            await ws_manager.broadcast({
                "type": "barrier.entry",
                "data": {
                    "action": "OPEN",
                    "slot": res.get("slot"),
                    "plate": res.get("plate_number") or det_plate,
                    "message": "Entry boom barrier lifted (Servo 90°)"
                }
            })

    return DetectionResponse(
        status=res["status"],
        message=res["message"],
        slot=res["slot"],
        trigger_buzzer=res.get("trigger_buzzer", False),
        open_barrier=res.get("open_barrier", False),
        barrier_action=res.get("barrier_action", "LOCKED"),
        confidence=res["confidence"],
        camera="ENTRY",
        vehicle_type=vehicle_type,
        plate_number=res.get("plate_number") or det_plate
    )


@app.post("/api/detection/exit", response_model=DetectionResponse)
async def detect_exit(
    file: UploadFile = File(None),
    vehicle_type: str = Form("Car"),
    plate_number: str = Form(None),
    confidence: float = Form(None),
    sync: bool = True,
    db: Session = Depends(get_db)
):
    """
    Exit Camera Endpoint.
    Receives multipart JPEG frame from Exit ESP32-CAM (or direct simulation payload).
    Executes ANPR pipeline, matches against active parking sessions,
    releases assigned slot, broadcasts over WebSocket,
    and returns explicit status (released / no_active_session / no_plate / debounced).
    """
    if file is not None:
        image_bytes = await file.read()
        if not image_bytes or len(image_bytes) == 0:
            return DetectionResponse(
                status="no_plate",
                message="Uploaded exit frame is empty",
                slot=None,
                trigger_buzzer=False,
                confidence=0.0,
                camera="EXIT",
                vehicle_type=vehicle_type,
                plate_number=None
            )
        try:
            logger.info(f"[CAMERA: EXIT] Frame received ({len(image_bytes)} bytes, vehicle_type='{vehicle_type}', plate='{plate_number}')")
            res = await exit_frame_processor._process_exit(image_bytes, vehicle_type, plate_number)
            return DetectionResponse(
                status=res.get("status", "no_plate"),
                message=res.get("message", "Exit frame processed"),
                slot=res.get("slot"),
                trigger_buzzer=False,
                confidence=res.get("confidence", 1.0),
                camera="EXIT",
                vehicle_type=res.get("vehicle_type", vehicle_type),
                plate_number=res.get("plate_number")
            )
        except Exception as e:
            logger.error(f"[CAMERA: EXIT] Error during exit frame processing: {e}", exc_info=True)
            return DetectionResponse(
                status="no_plate",
                message=f"Exit processing exception: {str(e)}",
                slot=None,
                trigger_buzzer=False,
                confidence=0.0,
                camera="EXIT",
                vehicle_type=vehicle_type,
                plate_number=None
            )

    logger.info(f"[CAMERA: EXIT] Direct API request received (no file, vehicle_type='{vehicle_type}', plate='{plate_number}', sync={sync})")

    det_confidence = confidence if confidence is not None else 0.921
    det_plate = plate_number

    res = release_exit_slot(
        db=db,
        vehicle_type=vehicle_type,
        plate_number=det_plate,
        confidence=det_confidence
    )
    logger.info(f"[CAMERA: EXIT] Direct request handled: status='{res['status']}', slot='{res.get('slot')}', plate='{res.get('plate_number')}'")

    if res["status"] == "released":
        await ws_manager.broadcast({
            "type": "slot.released",
            "data": {
                "slot": res["slot"],
                "vehicle": vehicle_type,
                "plate_number": res.get("plate_number") or det_plate,
                "confidence": res["confidence"],
                "duration_formatted": res.get("duration_formatted"),
                "billed_amount": res.get("billed_amount"),
                "open_barrier": True
            }
        })
        await ws_manager.broadcast({
            "type": "vehicle.exited",
            "data": {
                "slot": res["slot"],
                "vehicle": vehicle_type,
                "plate_number": res.get("plate_number") or det_plate,
                "duration_formatted": res.get("duration_formatted"),
                "billed_amount": res.get("billed_amount")
            }
        })
        await ws_manager.broadcast({
            "type": "barrier.exit",
            "data": {
                "action": "OPEN",
                "slot": res["slot"],
                "plate": res.get("plate_number") or det_plate,
                "message": "Exit boom barrier lifted (Servo 90°)"
            }
        })

    return DetectionResponse(
        status=res["status"],
        message=res["message"],
        slot=res["slot"],
        trigger_buzzer=False,
        open_barrier=res.get("open_barrier", False),
        barrier_action=res.get("barrier_action", "LOCKED"),
        confidence=res["confidence"],
        camera="EXIT",
        vehicle_type=vehicle_type,
        plate_number=res.get("plate_number") or det_plate,
        session_id=res.get("session_id"),
        duration_minutes=res.get("duration_minutes"),
        duration_formatted=res.get("duration_formatted"),
        billed_amount=res.get("billed_amount"),
        entry_time=res.get("entry_time"),
        exit_time=res.get("exit_time")
    )


# ==================== AUTHENTICATION ENDPOINTS ====================

@app.post("/api/auth/register", response_model=TokenResponse)
def register_user(req: UserRegisterRequest, db: Session = Depends(get_db)):
    """
    Registers a new user driver account with bcrypt password hashing.
    """
    username_clean = req.username.strip().lower()
    existing_user = db.query(User).filter(User.username == username_clean).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username is already taken. Please choose another."
        )

    email_clean = req.email.strip().lower() if req.email else None
    if email_clean:
        if db.query(User).filter(User.email == email_clean).first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email address is already registered."
            )

    hashed_pw = hash_password(req.password)
    new_user = User(
        username=username_clean,
        email=email_clean,
        hashed_password=hashed_pw,
        full_name=req.full_name.strip() if req.full_name else None,
        phone=req.phone.strip() if req.phone else None,
        role="driver",
        created_at=utcnow()
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    token = create_access_token(data={"sub": str(new_user.id), "username": new_user.username, "role": new_user.role})
    user_resp = UserResponse(
        id=new_user.id,
        username=new_user.username,
        email=new_user.email,
        full_name=new_user.full_name,
        phone=new_user.phone,
        role=new_user.role,
        created_at=new_user.created_at.isoformat() if new_user.created_at else None
    )
    return TokenResponse(access_token=token, token_type="bearer", user=user_resp)


@app.post("/api/auth/login", response_model=TokenResponse)
def login_user(req: UserLoginRequest, db: Session = Depends(get_db)):
    """
    Authenticates user with username and password, returns signed JWT access token.
    """
    username_clean = req.username.strip().lower()
    user = db.query(User).filter(User.username == username_clean).first()

    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )

    token = create_access_token(data={"sub": str(user.id), "username": user.username, "role": user.role})
    user_resp = UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        phone=user.phone,
        role=user.role,
        created_at=user.created_at.isoformat() if user.created_at else None
    )
    return TokenResponse(access_token=token, token_type="bearer", user=user_resp)


@app.get("/api/auth/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """
    Returns current authenticated user details.
    """
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        full_name=current_user.full_name,
        phone=current_user.phone,
        role=current_user.role,
        created_at=current_user.created_at.isoformat() if current_user.created_at else None
    )


# ==================== VEHICLE PRE-CHECK-IN & BOOKINGS ====================

@app.post("/api/bookings/pre-checkin", response_model=PreCheckinResponse)
async def create_pre_checkin(
    req: PreCheckinRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Pre-arrival check-in: Registers user's license plate BEFORE reaching the parking lot.
    The vehicle is then pre-authorized for the entry camera.
    """
    clean_plate = re.sub(r'[^A-Z0-9]', '', req.plate_number.upper().strip())
    if len(clean_plate) < 4:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="License plate must contain at least 4 alphanumeric characters."
        )

    # 1. Check if user already has an active parked session
    user_active_session = db.query(ParkingSession).filter(
        ParkingSession.user_id == current_user.id,
        ParkingSession.status == "ACTIVE"
    ).first()
    if user_active_session:
        slot = db.query(ParkingSlot).filter(ParkingSlot.id == user_active_session.slot_id).first()
        slot_name = slot.slot_number if slot else "assigned slot"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"You already have an active vehicle ({user_active_session.plate_number}) parked in {slot_name}. Please complete your exit before checking in another vehicle."
        )

    # 2. Check if this exact plate is currently parked inside the lot
    all_active_sessions = db.query(ParkingSession).filter(ParkingSession.status == "ACTIVE").all()
    for s in all_active_sessions:
        if s.plate_number and are_plates_similar(clean_plate, s.plate_number):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Vehicle [{clean_plate}] is already actively parked inside the parking lot."
            )

    now = utcnow()
    duration = req.duration_hours or 2
    expires = now + timedelta(hours=duration)

    # 3. Check if user already has a pending pre-registration
    existing_booking = db.query(PreRegistration).filter(
        PreRegistration.user_id == current_user.id,
        PreRegistration.status == "PENDING_ARRIVAL"
    ).first()

    # 4. Resolve and allocate requested parking bay
    target_slot = None
    if req.slot_number:
        clean_slot_num = req.slot_number.upper().strip()
        target_slot = db.query(ParkingSlot).filter(ParkingSlot.slot_number == clean_slot_num).first()
        if not target_slot:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Parking bay '{req.slot_number}' does not exist."
            )
        # Check if bay is available or already reserved by THIS user's active booking
        if target_slot.status != "AVAILABLE":
            if not (existing_booking and existing_booking.slot_id == target_slot.id):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Bay {target_slot.slot_number} is currently {target_slot.status.lower()}. Please select an available bay."
                )
    else:
        # If user didn't pick a specific bay, pick the first AVAILABLE bay
        target_slot = db.query(ParkingSlot).filter(
            ParkingSlot.status == "AVAILABLE"
        ).order_by(ParkingSlot.slot_number.asc()).first()
        if not target_slot and not (existing_booking and existing_booking.slot_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="All parking bays are fully occupied or reserved. No bay available."
            )

    # If updating existing booking and changing slots, release the previous slot
    if existing_booking and existing_booking.slot_id and target_slot and existing_booking.slot_id != target_slot.id:
        old_slot = db.query(ParkingSlot).filter(ParkingSlot.id == existing_booking.slot_id).first()
        if old_slot and old_slot.status == "ALLOCATED":
            old_slot.status = "AVAILABLE"
            old_slot.updated_at = now
            await ws_manager.broadcast({
                "type": "slot.released",
                "data": {
                    "slot_id": old_slot.id,
                    "slot_number": old_slot.slot_number,
                    "status": "AVAILABLE"
                }
            })

    # Mark target slot as ALLOCATED
    if target_slot:
        target_slot.status = "ALLOCATED"
        target_slot.updated_at = now

    if existing_booking:
        existing_booking.plate_number = clean_plate
        existing_booking.vehicle_type = req.vehicle_type
        existing_booking.expires_at = expires
        existing_booking.created_at = now
        if target_slot:
            existing_booking.slot_id = target_slot.id
        db.commit()
        db.refresh(existing_booking)
        booking = existing_booking
    else:
        booking = PreRegistration(
            user_id=current_user.id,
            plate_number=clean_plate,
            vehicle_type=req.vehicle_type,
            status="PENDING_ARRIVAL",
            slot_id=target_slot.id if target_slot else None,
            created_at=now,
            expires_at=expires
        )
        db.add(booking)
        db.commit()
        db.refresh(booking)

    # Get slot number for response & events
    allocated_bay_number = target_slot.slot_number if target_slot else None
    if not allocated_bay_number and booking.slot_id:
        b_slot = db.query(ParkingSlot).filter(ParkingSlot.id == booking.slot_id).first()
        allocated_bay_number = b_slot.slot_number if b_slot else None

    # Broadcast slot allocation event
    if target_slot:
        await ws_manager.broadcast({
            "type": "slot.allocated",
            "data": {
                "slot_id": target_slot.id,
                "slot_number": target_slot.slot_number,
                "status": "ALLOCATED",
                "plate_number": clean_plate,
                "vehicle_type": req.vehicle_type
            }
        })

    # Broadcast event to WebSocket subscribers (admin dashboard updates in real-time)
    driver_name = current_user.full_name or current_user.username
    await ws_manager.broadcast({
        "type": "booking.created",
        "data": {
            "booking_id": booking.id,
            "user_id": current_user.id,
            "driver_name": driver_name,
            "plate_number": clean_plate,
            "vehicle_type": req.vehicle_type,
            "status": "PENDING_ARRIVAL",
            "slot_number": allocated_bay_number,
            "expires_at": booking.expires_at.isoformat() if booking.expires_at else None
        }
    })

    return PreCheckinResponse(
        id=booking.id,
        user_id=booking.user_id,
        driver_name=driver_name,
        plate_number=booking.plate_number,
        vehicle_type=booking.vehicle_type,
        status=booking.status,
        created_at=booking.created_at.isoformat() if booking.created_at else None,
        expires_at=booking.expires_at.isoformat() if booking.expires_at else None,
        slot_number=allocated_bay_number
    )


@app.get("/api/bookings/my-status", response_model=MyStatusResponse)
def get_my_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns the logged-in user's active booking, parked vehicle, assigned slot, and arrival clearance.
    """
    now = utcnow()

    # Active pending booking check
    active_booking = db.query(PreRegistration).filter(
        PreRegistration.user_id == current_user.id,
        PreRegistration.status == "PENDING_ARRIVAL"
    ).order_by(PreRegistration.created_at.desc()).first()

    booking_resp = None
    if active_booking:
        if active_booking.expires_at and to_utc(active_booking.expires_at) < now:
            active_booking.status = "EXPIRED"
            if active_booking.slot_id:
                slot_to_rel = db.query(ParkingSlot).filter(ParkingSlot.id == active_booking.slot_id).first()
                if slot_to_rel and slot_to_rel.status == "ALLOCATED":
                    slot_to_rel.status = "AVAILABLE"
                    slot_to_rel.updated_at = now
            db.commit()
        else:
            b_slot = db.query(ParkingSlot).filter(ParkingSlot.id == active_booking.slot_id).first() if active_booking.slot_id else None
            booking_resp = PreCheckinResponse(
                id=active_booking.id,
                user_id=active_booking.user_id,
                driver_name=current_user.full_name or current_user.username,
                plate_number=active_booking.plate_number,
                vehicle_type=active_booking.vehicle_type,
                status=active_booking.status,
                created_at=active_booking.created_at.isoformat() if active_booking.created_at else None,
                expires_at=active_booking.expires_at.isoformat() if active_booking.expires_at else None,
                slot_number=b_slot.slot_number if b_slot else None
            )

    # Active parking session check
    active_session = db.query(ParkingSession).filter(
        ParkingSession.user_id == current_user.id,
        ParkingSession.status == "ACTIVE"
    ).order_by(ParkingSession.entry_time.desc()).first()

    session_resp = None
    has_active_entry = False
    if active_session:
        has_active_entry = True
        slot = db.query(ParkingSlot).filter(ParkingSlot.id == active_session.slot_id).first()
        slot_number = slot.slot_number if slot else None
        session_resp = ParkingHistoryItem(
            id=active_session.id,
            vehicle_type=active_session.vehicle_type,
            plate_number=active_session.plate_number,
            slot_number=slot_number,
            entry_time=active_session.entry_time.isoformat() if active_session.entry_time else None,
            exit_time=None,
            status=active_session.status,
            booking_id=active_session.booking_id
        )

    user_resp = UserResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        full_name=current_user.full_name,
        phone=current_user.phone,
        role=current_user.role,
        created_at=current_user.created_at.isoformat() if current_user.created_at else None
    )

    return MyStatusResponse(
        user=user_resp,
        active_booking=booking_resp,
        active_session=session_resp,
        has_active_entry=has_active_entry
    )


@app.get("/api/bookings/my-history")
def get_my_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns personal parking session history for the logged-in user.
    """
    sessions = db.query(ParkingSession).filter(
        ParkingSession.user_id == current_user.id
    ).order_by(ParkingSession.entry_time.desc()).limit(20).all()

    result = []
    for s in sessions:
        slot = db.query(ParkingSlot).filter(ParkingSlot.id == s.slot_id).first()
        result.append({
            "id": s.id,
            "vehicle_type": s.vehicle_type,
            "plate_number": s.plate_number,
            "slot_number": slot.slot_number if slot else "N/A",
            "entry_time": s.entry_time.isoformat() if s.entry_time else None,
            "exit_time": s.exit_time.isoformat() if s.exit_time else None,
            "status": s.status,
            "booking_id": s.booking_id
        })
    return {"history": result}


@app.get("/api/bookings/pending")
def get_pending_bookings(db: Session = Depends(get_db)):
    """
    Lists all vehicles currently authorized and awaiting entry.
    """
    now = utcnow()
    bookings = db.query(PreRegistration).filter(
        PreRegistration.status == "PENDING_ARRIVAL"
    ).order_by(PreRegistration.created_at.asc()).all()

    result = []
    for b in bookings:
        if b.expires_at and to_utc(b.expires_at) < now:
            b.status = "EXPIRED"
            db.commit()
            continue
        driver = b.user.full_name or b.user.username if b.user else "Driver"
        result.append({
            "id": b.id,
            "user_id": b.user_id,
            "driver_name": driver,
            "plate_number": b.plate_number,
            "vehicle_type": b.vehicle_type,
            "status": b.status,
            "created_at": b.created_at.isoformat() if b.created_at else None,
            "expires_at": b.expires_at.isoformat() if b.expires_at else None
        })
    return {"pending_bookings": result}


@app.delete("/api/bookings/{booking_id}")
async def cancel_booking(
    booking_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Cancels a pending pre-check-in booking.
    """
    booking = db.query(PreRegistration).filter(PreRegistration.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to cancel this booking")
    if booking.status != "PENDING_ARRIVAL":
        raise HTTPException(status_code=400, detail=f"Cannot cancel booking with status '{booking.status}'")

    booking.status = "CANCELLED"
    if booking.slot_id:
        allocated_slot = db.query(ParkingSlot).filter(ParkingSlot.id == booking.slot_id).first()
        if allocated_slot and allocated_slot.status == "ALLOCATED":
            allocated_slot.status = "AVAILABLE"
            allocated_slot.updated_at = utcnow()
            await ws_manager.broadcast({
                "type": "slot.released",
                "data": {
                    "slot_id": allocated_slot.id,
                    "slot_number": allocated_slot.slot_number,
                    "status": "AVAILABLE"
                }
            })
    db.commit()

    await ws_manager.broadcast({
        "type": "booking.cancelled",
        "data": {
            "booking_id": booking_id,
            "plate_number": booking.plate_number
        }
    })
    return {"status": "success", "message": "Pre-check-in booking cancelled"}


# ==================== PARKING LAYOUT & METRICS ====================

@app.get("/api/parking/layout")
def get_parking_layout(db: Session = Depends(get_db)):
    """
    Returns full current visual layout of all slots (A1..A3, B1..B3) and active sessions.
    """
    slots = db.query(ParkingSlot).order_by(ParkingSlot.slot_number.asc()).all()
    layout = []
    
    # Query active sessions for slot mapping
    active_sessions = {
        s.slot_id: s for s in db.query(ParkingSession).filter(ParkingSession.status == "ACTIVE").all()
    }

    for slot in slots:
        session_info = None
        if slot.id in active_sessions:
            s = active_sessions[slot.id]
            session_info = {
                "session_id": s.id,
                "vehicle_type": s.vehicle_type,
                "plate_number": s.plate_number,
                "entry_time": s.entry_time.isoformat() if s.entry_time else None
            }

        layout.append({
            "id": slot.id,
            "slot_number": slot.slot_number,
            "status": slot.status,
            "updated_at": slot.updated_at.isoformat() if slot.updated_at else None,
            "active_session": session_info
        })

    return {"slots": layout}


@app.get("/api/parking/slots")
def get_parking_slots(db: Session = Depends(get_db)):
    """
    Returns array of all slots with active session mapping.
    """
    layout_data = get_parking_layout(db=db)
    return layout_data["slots"]


@app.get("/api/parking/summary", response_model=SummaryResponse)
def get_parking_summary(db: Session = Depends(get_db)):
    """
    Returns real-time aggregate statistics.
    """
    total = db.query(ParkingSlot).count()
    available = db.query(ParkingSlot).filter(ParkingSlot.status == "AVAILABLE").count()
    allocated = db.query(ParkingSlot).filter(ParkingSlot.status == "ALLOCATED").count()
    occupied = db.query(ParkingSlot).filter(ParkingSlot.status == "OCCUPIED").count()
    blocked = db.query(ParkingSlot).filter(ParkingSlot.status.in_(["BLOCKED", "MAINTENANCE"])).count()
    active_bookings = db.query(PreRegistration).filter(PreRegistration.status == "PENDING_ARRIVAL").count()

    return SummaryResponse(
        total_slots=total,
        available=available,
        allocated=allocated,
        occupied=occupied,
        blocked=blocked,
        active_bookings=active_bookings
    )


# ==================== DEMO & CONTROL ACTIONS ====================

@app.post("/api/parking/reset")
async def reset_demo(db: Session = Depends(get_db)):
    """
    College Demonstration Reset button endpoint. Resets all slots to AVAILABLE.
    """
    res = reset_all_parking_demo(db)
    await ws_manager.broadcast({
        "type": "demo.reset",
        "data": {
            "message": "Demo reset: All slots reset to AVAILABLE"
        }
    })
    return res


@app.post("/api/parking/release/{slot_number}")
async def manual_release(slot_number: str, db: Session = Depends(get_db)):
    """
    Manual override action to release a slot if car gets stuck or for demo testing.
    """
    res = manual_release_slot_by_number(db, slot_number)
    if res["status"] == "success":
        await ws_manager.broadcast({
            "type": "slot.released",
            "data": {
                "slot": slot_number,
                "manual": True
            }
        })
    return res


@app.post("/api/parking/simulate/entry")
async def simulate_entry(
    authorized: bool = True,
    plate_number: Optional[str] = None,
    vehicle_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Demo Mode Simulation Trigger for Entry.
    Supports simulating authorized vehicle entry (auto-registers demo pass)
    or unauthorized vehicle rejection (unregistered vehicle).
    """
    v_type = vehicle_type or "Toy Car"
    target_plate = (plate_number or ("KA05KK0403" if authorized else "UNAUTH999")).upper()

    if authorized:
        # Ensure demo user exists
        demo_user = db.query(User).filter(User.username == "demouser").first()
        if not demo_user:
            demo_user = User(
                username="demouser",
                hashed_password=hash_password("demo1234"),
                full_name="Demo Driver",
                role="driver",
                created_at=utcnow()
            )
            db.add(demo_user)
            db.commit()
            db.refresh(demo_user)

        # Ensure a pending pre-checkin exists for this plate if not already parked
        existing_booking = db.query(PreRegistration).filter(
            PreRegistration.plate_number == target_plate,
            PreRegistration.status == "PENDING_ARRIVAL"
        ).first()

        if not existing_booking:
            active_s = db.query(ParkingSession).filter(
                ParkingSession.plate_number == target_plate,
                ParkingSession.status == "ACTIVE"
            ).first()
            if not active_s:
                new_booking = PreRegistration(
                    user_id=demo_user.id,
                    plate_number=target_plate,
                    vehicle_type=v_type,
                    status="PENDING_ARRIVAL",
                    created_at=utcnow(),
                    expires_at=utcnow() + timedelta(hours=2)
                )
                db.add(new_booking)
                db.commit()

    res = allocate_entry_slot(
        db=db,
        vehicle_type=v_type,
        plate_number=target_plate,
        confidence=0.96,
        bypass_cooldown=True
    )
    
    if res["status"] in ["allocated", "already_allocated"]:
        await ws_manager.broadcast({
            "type": "slot.allocated",
            "data": {
                "slot": res["slot"],
                "vehicle": v_type,
                "plate_number": target_plate,
                "confidence": res["confidence"],
                "status": res["status"],
                "trigger_buzzer": res["trigger_buzzer"],
                "open_barrier": True,
                "barrier_action": "OPEN"
            }
        })
        await ws_manager.broadcast({
            "type": "barrier.entry",
            "data": {
                "action": "OPEN",
                "slot": res["slot"],
                "plate": target_plate,
                "message": f"Entry boom barrier opened for slot {res['slot']}"
            }
        })
        if res["trigger_buzzer"]:
            await ws_manager.broadcast({
                "type": "buzzer.triggered",
                "data": {
                    "camera": "ENTRY",
                    "slot": res["slot"],
                    "plate_number": target_plate,
                    "message": f"Entry gate opened for slot assignment ({res['slot']})"
                }
            })
    elif res["status"] == "unauthorized":
        await ws_manager.broadcast({
            "type": "entry.unauthorized",
            "data": {
                "camera": "ENTRY",
                "detected": True,
                "confidence": res["confidence"],
                "plate_number": target_plate,
                "vehicle": v_type,
                "message": res["message"]
            }
        })
    elif res["status"] == "parking_full":
        await ws_manager.broadcast({
            "type": "parking.full",
            "data": {
                "message": "All parking slots are fully occupied!"
            }
        })

    return res


@app.post("/api/parking/simulate/exit")
async def simulate_exit(db: Session = Depends(get_db)):
    """
    Demo Mode Simulation Trigger for Exit.
    """
    # Find oldest active session
    active_session = db.query(ParkingSession).filter(ParkingSession.status == "ACTIVE").order_by(ParkingSession.entry_time.asc()).first()
    v_type = active_session.vehicle_type if active_session else "Car"
    p_num = active_session.plate_number if active_session else None

    res = release_exit_slot(db=db, vehicle_type=v_type, plate_number=p_num, confidence=0.93)
    
    if res["status"] == "released":
        await ws_manager.broadcast({
            "type": "slot.released",
            "data": {
                "slot": res["slot"],
                "vehicle": v_type,
                "plate_number": p_num,
                "confidence": res["confidence"],
                "duration_formatted": res.get("duration_formatted"),
                "billed_amount": res.get("billed_amount"),
                "open_barrier": True
            }
        })
        await ws_manager.broadcast({
            "type": "vehicle.exited",
            "data": {
                "slot": res["slot"],
                "vehicle": v_type,
                "plate_number": p_num,
                "duration_formatted": res.get("duration_formatted"),
                "billed_amount": res.get("billed_amount")
            }
        })
        await ws_manager.broadcast({
            "type": "barrier.exit",
            "data": {
                "action": "OPEN",
                "slot": res["slot"],
                "plate": p_num,
                "duration": res.get("duration_formatted"),
                "billed_amount": res.get("billed_amount"),
                "message": "Exit boom barrier opened (Servo 90°)"
            }
        })

    return res

# ==================== ANPR DIAGNOSTICS & DEBUGGING ====================

@app.get("/api/anpr/diagnostics")
def get_anpr_diagnostics():
    """
    Returns recent camera recognition evaluations, image quality (sharpness, lighting),
    YOLO plate bounding boxes, OCR candidates, and failure attribution.
    """
    from app.anpr_pipeline import get_latest_diagnostics
    diags = get_latest_diagnostics()
    return {
        "status": "success",
        "timestamp": datetime.now().isoformat(),
        "events": diags,
        "diagnostics": diags
    }


@app.get("/api/anpr/debug-image/{image_name}")
def get_anpr_debug_image(image_name: str):
    """
    Serves the latest raw camera frame, plate crop, or processed OCR image for visual inspection.
    """
    import os
    from app.anpr_pipeline import DEBUG_DIR
    clean_name = os.path.basename(image_name)
    file_path = os.path.join(DEBUG_DIR, clean_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Debug image not found")
    return FileResponse(file_path, media_type="image/jpeg")

# ==================== WEBSOCKET ENDPOINT ====================

@app.websocket("/ws/parking")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep connection open and listen for ping/messages
            data = await websocket.receive_text()
            # Respond to ping
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        ws_manager.disconnect(websocket)
