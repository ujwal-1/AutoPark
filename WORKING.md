# AutoPark — Complete Working Guide & New Session Context (WORKING.md)

> **Purpose:** This file contains everything required to understand, launch, test, and continue development on the **AutoPark Smart Parking System** in any new AI chat session or fresh developer environment.

---

## 1. Quick Start Commands (Launch in 30 Seconds)

### Option A: The One-Click Startup Script
From the project root:
```bash
cd /Users/ujwalanand/Desktop/AutoPark/AutoPark
./start_all.sh
```
*(On Windows: double-click `start_all.bat`)*

---

### Option B: Manual Two-Terminal Launch

#### Terminal 1 — FastAPI Backend (Port 8000)
```bash
cd /Users/ujwalanand/Desktop/AutoPark/AutoPark/backend

# IMPORTANT: On this Mac, use Anaconda Python which has all dependencies (FastAPI, SQLAlchemy, Uvicorn, YOLO):
/opt/anaconda3/bin/python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# (On general machines with active venv: python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload)
```
- **Backend Health Check:** `http://localhost:8000/api/health`
- **Interactive Swagger Docs:** `http://localhost:8000/docs`

#### Terminal 2 — Next.js 14 Frontend Dashboard (Port 3000)
```bash
cd /Users/ujwalanand/Desktop/AutoPark/AutoPark/frontend
npm run dev
```
- **Dashboard Web UI:** `http://localhost:3000`
- **LAN Access (Mobile / Tablets):** `http://<your-lan-ip>:3000` (e.g. `http://192.168.0.109:3000`)

---

## 2. System Architecture & Tech Stack

```
                     +---------------------------------------+
                     |            Hardware Gates             |
                     |   [Entry ESP32-CAM]  [Exit ESP32-CAM] |
                     |   - OV2640 Lens      - OV2640 Lens    |
                     |   - SG90 Servo (90°) - SG90 Servo     |
                     +---------------------------------------+
                                         |
                      HTTP POST JPEG frames / Multipart
                                         v
+----------------------------------------------------------------------------------+
|                              FastAPI Backend Core                                |
|  - Computer Vision: YOLOv11 (`yolo11n.pt`) plate detection + OCR extraction      |
|  - Slot Allocator: Thread-safe atomic bay allocation (`app/slot_allocator.py`)    |
|  - Database: SQLite (`autopark.db`) with SQLAlchemy ORM                          |
|  - Real-Time WebSockets: Broadcasts gate, slot & timer events to `/ws/parking`   |
|  - Rate Engine: ₹30 flat first hour + ₹20/hr increments                          |
+----------------------------------------------------------------------------------+
                                         ^
                       REST APIs & Bi-directional WebSocket
                                         v
+----------------------------------------------------------------------------------+
|                            Next.js 14 Web Dashboard                              |
|  - Framework: App Router, React 18, Tailwind CSS, Lucide Icons, Framer Motion     |
|  - Palette: Architectural concrete/paper theme with warm amber/paint accents     |
|  - Routes:                                                                       |
|      /             -> Live Parking Deck & Bay Overview (A1-A3, B1-B3)            |
|      /book         -> Pre-Arrival Bay Reservation with Interactive Slot Selector |
|      /pass         -> Driver Clearance Pass (Pre-Arrival Hold & Live Ticking Fee)|
|      /operator     -> 2D Facility Twin, Live Camera Ingestion, Hardware Overrides|
|      /history      -> Itemized Digital Exit Receipts & Invoice Audit Trail       |
|      /login        -> Driver & Operator Authentication                           |
|      /register     -> User Sign-Up                                               |
+----------------------------------------------------------------------------------+
```

---

## 3. Directory Layout

```text
/Users/ujwalanand/Desktop/AutoPark/
├── WORKING.md                          <-- (This file) Complete new session guide
├── AutoPark_Chat_Context.md            <-- Technical dossier & architecture details
├── AutoPark_Chat_History_Transcript.md <-- Full verbatim transcript of previous session
├── Conference template.docx            <-- Research paper template
└── AutoPark/                           <-- MAIN GIT REPOSITORY (origin: github.com/ujwal-1/AutoPark.git)
    ├── autopark.db                     <-- SQLite Database file
    ├── yolo11n.pt                      <-- Pre-trained YOLOv11 plate weight model
    ├── start_all.sh / start_all.bat    <-- One-click launch scripts
    ├── backend/                        <-- FastAPI Python Backend
    │   ├── app/
    │   │   ├── main.py                 <-- API routes, WebSocket manager, lifecycle events
    │   │   ├── models.py               <-- SQLAlchemy DB models (ParkingSlot, Session, etc.)
    │   │   ├── schemas.py              <-- Pydantic request/response schemas
    │   │   ├── slot_allocator.py       <-- Thread-safe slot allocation & ANPR verification
    │   │   ├── database.py             <-- SQLite engine & session factory
    │   │   ├── config.py               <-- Application settings
    │   │   ├── yolo_plate_model.py     <-- YOLOv11 inference pipeline
    │   │   └── easyocr_engine.py       <-- Character extraction engine
    │   ├── tests/                      <-- Pytest test suite
    │   └── requirements.txt            <-- Backend Python packages
    ├── frontend/                       <-- Next.js 14 App Router Frontend
    │   ├── src/
    │   │   ├── app/
    │   │   │   ├── page.tsx            <-- Live Deck (Home)
    │   │   │   ├── book/page.tsx       <-- Pre-booking with 6-Bay Selector
    │   │   │   ├── pass/page.tsx       <-- Driver Active Pass (Pre-arrival & Parked)
    │   │   │   ├── operator/page.tsx   <-- Operator Console & 2D Twin
    │   │   │   ├── history/page.tsx    <-- Invoices & History
    │   │   │   ├── login/page.tsx      <-- Login page
    │   │   │   ├── register/page.tsx   <-- Register page
    │   │   │   └── globals.css         <-- Theme variables & CSS utility classes
    │   │   ├── components/
    │   │   │   ├── Navbar.tsx          <-- Navigation header with District P logo
    │   │   │   ├── DistrictLogo.tsx    <-- Dual-barrier boom // P // vector icon
    │   │   │   ├── ParkingLayout.tsx   <-- 6-bay facility grid
    │   │   │   ├── LiveCameraFeed.tsx  <-- Entry/Exit streaming canvas
    │   │   │   ├── TelemetryPanel.tsx  <-- Hardware telemetry strips
    │   │   │   ├── SessionsTable.tsx   <-- Active parked sessions list
    │   │   │   └── LastReceiptPanel.tsx<-- Exit billing breakdown
    │   │   └── lib/
    │   │       ├── config.ts           <-- Backend host & WebSocket URL resolver
    │   │       └── types.ts            <-- TypeScript interfaces
    │   ├── tailwind.config.ts          <-- Design system tokens
    │   └── package.json                <-- Dependencies
    └── hardware/
        ├── entry_esp32cam/             <-- Entry ESP32-CAM sketch (Servo + Buzzer + Camera)
        └── exit_esp32cam/              <-- Exit ESP32-CAM sketch (Servo + Camera)
```

---

## 4. Key Workflows & Resolved Quirks

### 4.1 Slot Reservation & Allocation (Crucial Context)
* **The Problem That Was Solved:** Previously, clicking Bay A2, A3, or B1 on the live deck still booked Bay A1.
* **How It Works Now:**
  1. `/book?slot=A2` reads the search param via `useSearchParams()`.
  2. The interactive 6-bay selector in `frontend/src/app/book/page.tsx` highlights Bay A2 and sends `{ slot_number: "A2", plate_number, vehicle_type, duration_hours }` to `POST /api/bookings/pre-checkin`.
  3. `backend/app/main.py` allocates the requested slot, marks `slot.status = "ALLOCATED"`, links `booking.slot_id`, and broadcasts `slot.allocated` via WebSocket.
  4. When the vehicle reaches the entry camera, `backend/app/slot_allocator.py` inspects `pending_booking.slot_id` and assigns **that exact bay**, opening the barrier.
  5. The Active Pass at `/pass` displays `BAY A2` with a `Guaranteed Hold` badge.
  6. If cancelled via `/pass`, the slot is immediately freed back to `AVAILABLE`.

### 4.2 Python Environment Note (Mac Setup)
* The default macOS Python `/Library/Frameworks/...` does not have dependencies installed.
* **Always run backend with:**
  ```bash
  /opt/anaconda3/bin/python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
  ```
  *(Or check `which python3` inside an activated virtual environment).*

### 4.3 Network & Cross-Device Access
* Both backend and frontend bind to `0.0.0.0` so mobile devices on the same Wi-Fi network can access the web dashboard at `http://<machine-ip>:3000`.
* `frontend/src/lib/config.ts` dynamically resolves `window.location.hostname` so WebSockets automatically connect to `ws://<machine-ip>:8000/ws/parking` from phones and tablets.

---

## 5. Primary API Routes & Contract

| Endpoint | Method | Payload / Params | Purpose |
| :--- | :--- | :--- | :--- |
| `/api/health` | `GET` | — | Health check & model status |
| `/api/parking/layout` | `GET` | — | Current state of bays A1-A3, B1-B3 |
| `/api/parking/summary` | `GET` | — | Metrics (total, available, allocated, occupied) |
| `/api/bookings/pre-checkin` | `POST` | `{ plate_number, vehicle_type, duration_hours, slot_number? }` | Pre-register vehicle & reserve bay |
| `/api/bookings/my-status` | `GET` | Bearer Token | Current user active booking & parked session |
| `/api/bookings/{id}` | `DELETE`| Bearer Token | Cancel booking & release reserved bay |
| `/api/detection/entry` | `POST` | Multipart Form: `file` OR `plate_number` | Entry ANPR verification & boom barrier trigger |
| `/api/detection/exit` | `POST` | Multipart Form: `file` OR `plate_number` | Exit ANPR, duration calculation & fee billing |
| `/ws/parking` | `WebSocket` | Bi-directional JSON stream | Live updates (`slot.allocated`, `barrier.entry`, etc.) |

---

## 6. Git Status & Repository Notes

* **Repository Directory:** `/Users/ujwalanand/Desktop/AutoPark/AutoPark`
* **Remote:** `https://github.com/ujwal-1/AutoPark.git` (branch `main`)
* **Local Commits ahead of origin:**
  - `e6b1724` — `feat(frontend): operator telemetry panels and layout styling`
  - `d927ed4` — `feat(ui): apply concrete/garage palette across the app`
* **To Push to GitHub:**
  ```bash
  cd /Users/ujwalanand/Desktop/AutoPark/AutoPark
  git push origin main
  ```

---

## 7. Ready-to-Use Prompt for a New AI Session

When opening a new chat window, simply paste this snippet to instantly brief the AI:

```markdown
I am continuing work on AutoPark, a Smart Parking System with Next.js 14 frontend, FastAPI backend, YOLOv11 ANPR, and ESP32-CAM boom barrier hardware. 

Please read the file `WORKING.md` located at `/Users/ujwalanand/Desktop/AutoPark/WORKING.md` before answering. 

It contains the architecture, running instructions, API reference, resolved bugs, and directory structure. Let's pick up from there.
```

