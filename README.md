# AutoPark

A camera-based smart parking system. Two ESP32-CAM nodes watch the entry and exit
gates, a FastAPI backend reads the number plate, allocates one of six bays and
lifts an SG90 boom barrier, and a Next.js dashboard shows slot state and session
history live over WebSocket.

The design premise: two gate cameras replace one occupancy sensor per bay, so
capacity can grow without adding hardware at each slot.

## Stack

| Layer | Implementation |
|---|---|
| Edge | 2 × ESP32-CAM (AI-Thinker), VGA/PSRAM, 5 s capture loop |
| Actuator | SG90 micro-servo on GPIO 12 — 0° closed, 90° open, 5 s hold |
| Backend | FastAPI + Uvicorn, SQLAlchemy + SQLite, port 8000 |
| Vision | YOLO11 plate detector (`backend/models/license_plate_best.pt`) + EasyOCR |
| Frontend | Next.js 14 (App Router), React 18, Tailwind, port 3000 |

Capacity is **6 bays**: A1–A3 (Zone A) and B1–B3 (Zone B).

## Run it

Backend:

```bash
pip install -r backend/requirements.txt
pip install ultralytics easyocr        # not yet listed in requirements.txt

cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000   # or: python start_backend.py
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

The database and the six slots are created on first start, so no seed step is
needed. `scripts/verify_system.sh` runs the automated checks, and
`scripts/host.sh start|stop|status|logs` runs both services in the background.

## Layout

```
backend/     FastAPI app, ANPR pipeline, SQLite schema, tests
frontend/    Next.js dashboard
hardware/    ESP32-CAM sketches for the entry and exit gates
docs/        Project report (PDF + generator), full dossier, diagrams
scripts/     Report build, system verification, local hosting
```

Before flashing the sketches, fill in `WIFI_SSID` and `WIFI_PASSWORD` at the top
of each `.ino` file.

## Documentation

- `docs/report/AutoPark_Project_Report.pdf` — the full project report (76 pages)
- `docs/project-dossier/` — source markdown behind the report, plus runbook and glossary
- `docs/antigravity-context/` — working notes from development

## Measurement status

Recognition accuracy and end-to-end latency have not been measured on the current
hardware yet; the report marks those cells as pending rather than quoting numbers
from the earlier prototype. The older conference draft in
`docs/antigravity-context/` is kept for provenance and is explicitly superseded —
its 96.4 % / 184 ms figures do not describe this code.
