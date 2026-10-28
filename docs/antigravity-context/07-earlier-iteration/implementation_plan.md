# Implementation Plan — AutoPark Smart Parking System

Design and development of AutoPark, a camera-based smart parking system prototype with real-time slot monitoring, YOLO detection, atomic slot allocation, buzzer alerts, and an interactive dashboard.

## User Review Required

> [!IMPORTANT]
> - **Detection Pipeline**: The backend will support both live image frame ingestion (`/api/detection/entry`, `/api/detection/exit`) and direct JSON detection triggers. It includes a hybrid YOLO/OpenCV green RC car detection module with fallback color thresholding so physical green RC cars are reliably detected even without pre-trained model weights.
> - **Demo Simulation Mode**: Includes interactive "Simulate Entry" and "Simulate Exit" buttons on the web UI that invoke the exact same backend allocation logic as the ESP32-CAM hardware streams.

## Open Questions

> [!NOTE]
> None. All specifications from the PRD are fully clear and unambiguous.

## Proposed Changes

### System Architecture & Project Structure

The project will be organized cleanly within `~/AutoPark` as follows:

```
AutoPark/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # FastAPI app initialization, CORS, WebSocket router
│   │   ├── config.py            # System configuration (cooldowns, confidence, slots)
│   │   ├── database.py          # SQLAlchemy engine, session maker, DB init
│   │   ├── models.py            # Database models (ParkingSlot, ParkingSession, DetectionEvent)
│   │   ├── schemas.py           # Pydantic schemas for APIs & WebSocket payloads
│   │   ├── slot_allocator.py    # Atomic slot allocation logic & session state manager
│   │   ├── yolo_detector.py     # YOLO & HSV Green RC car image detection engine
│   │   └── websocket_manager.py # WebSocket connection & broadcasting manager
│   ├── requirements.txt         # Dependencies (fastapi, uvicorn, sqlalchemy, opencv-python, ultralytics, etc.)
│   └── start_backend.py         # Helper runner script
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.tsx            # Header with connection status & system title
│   │   │   ├── StatsOverview.tsx     # Total, Available, Allocated, Occupied counters
│   │   │   ├── ParkingLayout.tsx     # Seat-booking style 2x4 interactive grid (A1-A4, B1-B4)
│   │   │   ├── NotificationBanner.tsx# Prominent assigned slot popup modal/banner
│   │   │   ├── LiveCameraFeed.tsx    # Live camera preview & detection confidence indicator
│   │   │   ├── LiveActivityLog.tsx   # Real-time event activity feed with timestamps
│   │   │   └── DemoControls.tsx      # Demo mode triggers & manual slot release / reset buttons
│   │   ├── pages/
│   │   │   └── index.tsx (or app/page.tsx)
│   │   ├── styles/
│   │   │   └── globals.css           # Modern dark-mode UI styles with animations
│   │   └── lib/
│   │       └── websocket.ts          # WebSocket client with auto-reconnect & state sync
│   ├── package.json
│   └── next.config.js
└── hardware/
    ├── entry_esp32cam/
    │   └── entry_esp32cam.ino        # ESP32-CAM Arduino sketch with WiFi & Buzzer logic
    └── exit_esp32cam/
        └── exit_esp32cam.ino         # ESP32-CAM Arduino sketch for Exit monitoring
```

---

### Backend (FastAPI + SQLAlchemy + WebSocket)

#### [NEW] [config.py](file://~/AutoPark/backend/app/config.py)
Configurable settings: slot count (8: A1-A4, B1-B4), YOLO confidence threshold (0.75), detection cooldown (10 seconds), DB URL (`sqlite:///./autopark.db`).

#### [NEW] [database.py](file://~/AutoPark/backend/app/database.py)
SQLAlchemy engine configuration, session maker, DB initialization helper.

#### [NEW] [models.py](file://~/AutoPark/backend/app/models.py)
Database entities:
- `ParkingSlot`: `id`, `slot_number` (A1..B4), `status` (`AVAILABLE`, `ALLOCATED`, `OCCUPIED`, `BLOCKED`, `MAINTENANCE`), `updated_at`.
- `ParkingSession`: `id`, `vehicle_type`, `slot_id`, `entry_time`, `exit_time`, `status` (`ACTIVE`, `COMPLETED`).
- `DetectionEvent`: `id`, `camera` (`ENTRY`, `EXIT`), `vehicle_type`, `confidence`, `detected_at`.

#### [NEW] [slot_allocator.py](file://~/AutoPark/backend/app/slot_allocator.py)
Thread-safe atomic allocation logic:
- Prevents double allocation across concurrent requests.
- Debounces repeated camera frames within the 10s cooldown window.
- Handles `ENTRY` vehicle detection -> allocates lowest available slot (e.g. A1) -> creates session -> returns allocation result with `trigger_buzzer=True`.
- Handles `EXIT` vehicle detection -> releases active session -> updates slot to `AVAILABLE` -> returns release result.
- Handles `PARKING_FULL` when zero slots are available.
- Handles duplicate detections for already allocated vehicles (returns existing slot).

#### [NEW] [yolo_detector.py](file://~/AutoPark/backend/app/yolo_detector.py)
Vision processing engine:
- Ingests image bytes (JPEG).
- Runs YOLO model or HSV color segmentation (detecting green RC car hue range with bounding box calculation & confidence calculation).
- Returns detection outcome: `{ "detected": True, "vehicle_type": "green_rc_car", "confidence": 0.947, "bbox": [x1, y1, x2, y2] }`.

#### [NEW] [websocket_manager.py](file://~/AutoPark/backend/app/websocket_manager.py)
Manages active web client WebSocket connections. Broadcasts event types: `slot.allocated`, `slot.released`, `parking.full`, `buzzer.triggered`, `camera.status`, etc.

#### [NEW] [main.py](file://~/AutoPark/backend/app/main.py)
FastAPI application defining REST API endpoints & WebSocket endpoint:
- `POST /api/detection/entry`
- `POST /api/detection/exit`
- `GET /api/parking/layout`
- `GET /api/parking/summary`
- `POST /api/parking/reset`
- `POST /api/parking/release/{slot_id}`
- `POST /api/parking/simulate/entry`
- `POST /api/parking/simulate/exit`
- `WS /ws/parking`

---

### Frontend (Next.js Dashboard)

#### [NEW] [frontend/src/app/page.tsx](file://~/AutoPark/frontend/src/app/page.tsx)
Main dashboard container integrating all visual modules:
1. **Header**: AutoPark title, system health badge, WebSocket connection indicator.
2. **Stats Bar**: Animated metric counters (Total: 8, Available, Allocated, Occupied).
3. **Assigned Slot Popup / Banner**: Highlighted notification when vehicle entry allocates a slot.
4. **Interactive Seat-Booking Layout**: 2x4 Grid (A1-A4, B1-B4) styled like movie/train seats with vibrant status badges (`AVAILABLE`, `ALLOCATED`, `OCCUPIED`).
5. **Live Camera & Detection Feed**: Image canvas showing real-time camera snapshot & YOLO bounding box overlay.
6. **Live Activity Timeline**: Real-time event log with timestamps.
7. **Demo Control Panel**: Buttons for "Simulate Green Car Entry", "Simulate Green Car Exit", "Reset Demo", and "Manual Slot Release".

---

### Hardware (ESP32-CAM Arduino Code)

#### [NEW] [hardware/entry_esp32cam/entry_esp32cam.ino](file://~/AutoPark/hardware/entry_esp32cam/entry_esp32cam.ino)
C++ sketch for ESP32-CAM #1 (Entry):
- Connects to Wi-Fi.
- Captures frames from OV2640 camera.
- Sends HTTP POST multipart image request to `http://<laptop-ip>:8000/api/detection/entry`.
- On receiving `{"trigger_buzzer": true}`, drives GPIO pin HIGH for double-beep sound.

#### [NEW] [hardware/exit_esp32cam/exit_esp32cam.ino](file://~/AutoPark/hardware/exit_esp32cam/exit_esp32cam.ino)
C++ sketch for ESP32-CAM #2 (Exit):
- Connects to Wi-Fi.
- Captures frames from OV2640 camera.
- Sends HTTP POST multipart image request to `http://<laptop-ip>:8000/api/detection/exit`.
- NO buzzer hardware logic.

---

## Verification Plan

### Automated Tests
- Test backend API routes using `pytest` & FastAPI `TestClient`:
  - Atomic slot allocation test.
  - Concurrency & double allocation prevention test.
  - Exit slot release test.
  - Cooldown & debouncing test.
  - Demo reset & manual release test.

### Manual Verification
1. Start FastAPI backend server.
2. Start Next.js frontend development server.
3. Open browser dashboard at `http://localhost:3000`.
4. Trigger "Simulate Green Car Entry" -> Verify A1 changes to `ALLOCATED`, notification banner pops up, WebSocket broadcasts event, activity log updates.
5. Trigger "Simulate Green Car Entry" again -> Verify A2 changes to `ALLOCATED`.
6. Trigger "Simulate Green Car Exit" -> Verify A1 changes to `AVAILABLE`.
7. Fill all 8 slots -> Verify "PARKING FULL" state handling.
8. Perform "RESET DEMO" -> Verify all slots return to `AVAILABLE`.
9. Test browser refresh -> Verify DB state is retained.
