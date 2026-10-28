# 03 — Technology Stack and Justification

> Every choice below is justified by a requirement of *this* system, not by popularity.
> In the viva, "why did you use X?" is really "what requirement forced X?".

---

## 1. Stack at a glance

| Layer | Technology | Version in repo | Role |
|---|---|---|---|
| Edge firmware | Arduino C++ (ESP32 core) | — | Capture + HTTP POST + servo control |
| Edge hardware | ESP32-CAM (AI-Thinker), SG90 servo, optional buzzer | — | Gate sensing and actuation |
| Plate detection | YOLOv11 (Ultralytics) | `ultralytics` (not pinned) | Locate plate region in frame |
| Plate reading | EasyOCR | (not listed in requirements) | Recognise characters |
| Image processing | OpenCV (headless) | `>=4.8.0` | Quality metrics, CLAHE, thresholding |
| Backend framework | FastAPI | `>=0.100.0` | REST + WebSocket API |
| ASGI server | Uvicorn | `>=0.22.0` | Serve the API |
| ORM | SQLAlchemy | `>=2.0.0` | Models and queries |
| Database | SQLite | stdlib | Persistence |
| Auth | PyJWT + bcrypt | `>=2.8.0`, `>=4.0.0` | Tokens and password hashing |
| Frontend framework | Next.js (App Router) | `^14.2.5` | Routing, rendering |
| UI runtime | React | `^18.3.1` | Components and state |
| Styling | Tailwind CSS | `^3.4.7` | Design system utilities |
| Icons | lucide-react | `^0.417.0` | Consistent line icons |
| Motion | Framer Motion | `^11.3.19` | Modal / card transitions |
| Language | TypeScript | `^5.5.4` | Type safety on the client |

---

## 2. Justification by requirement

### R1 — "The gate must work without a human"

**Chosen:** ESP32-CAM + FastAPI decision + servo.
**Why:** the ESP32-CAM is a single board with Wi-Fi, camera and GPIO. It can capture,
POST and drive a servo without a companion microcontroller. Offloading all decisions to
the backend means the camera firmware stays small enough to be reliable.
**Rejected:** Raspberry Pi at each gate (overkill, more power, more cost); Arduino Uno +
separate Wi-Fi shield (more wiring, less integrated).

### R2 — "Read Indian plates from a low-cost camera"

**Chosen:** YOLOv11 plate detector, then EasyOCR.
**Why:** a two-stage design separates *where* the plate is from *what it says*. The
detector can be fine-tuned on plate crops; the OCR engine can be swapped without
retraining. EasyOCR handles multi-line plates and returns per-token confidence, which
the scoring stage needs.
**Rejected:** single-shot OCR over the whole frame (too much background text); template
matching (fails on scale/rotation); cloud OCR (needs internet, adds latency and cost).

### R3 — "One source of truth, auditable"

**Chosen:** FastAPI + SQLAlchemy + SQLite.
**Why:** FastAPI gives typed request/response models and automatic OpenAPI docs at
`/docs`, which shortens integration and doubles as documentation for the report. SQLite
requires no server process and is sufficient for six bays and a single writer.
**Rejected:** PostgreSQL (operational overhead with no benefit at this scale); storing
state in memory (a restart would lose occupancy).

### R4 — "Live updates without refresh"

**Chosen:** WebSocket `/ws/parking`.
**Why:** occupancy changes are infrequent but must appear instantly on three screens.
A single broadcast channel is simpler than Server-Sent Events plus REST and supports
future bidirectional control.
**Rejected:** polling every second (wasteful, visible lag); long polling (more complex).

### R5 — "A UI that looks like an operations product, not a student demo"

**Chosen:** Next.js 14 + Tailwind + a monochrome token set ("District" design language).
**Why:** the App Router gives file-based routes for the five screens; Tailwind keeps the
design system in one config; the monochrome palette (near-black surfaces, white primary
actions, one accent per state) reads as infrastructure software.
**Rejected:** component libraries with default themes (immediately recognisable as a
template); gradient/neon dashboards (hard to read, dated).

### R6 — "Demonstrate without hardware"

**Chosen:** simulator endpoints that call the same allocator, DB and billing code.
**Why:** a demo that bypasses the backend would prove nothing. `/api/parking/simulate/*`
skips only frame capture.
**Rejected:** UI-only mock data.

---

## 3. Why these specific versions

- **Next.js 14 App Router** — the repo already uses server/client component boundaries;
  upgrading majors would churn every page for no functional gain.
- **React 18** — required by Next 14; concurrent rendering is not used explicitly.
- **SQLAlchemy 2.x** — the models use the 2.0 declarative style.
- **Pydantic 2.x** — FastAPI's response models and settings rely on it.
- **Tailwind 3.4** — custom colour tokens (`districtBg`, `districtCard`, …) are defined
  in `tailwind.config.js`.

---

## 4. Runtime topology and practical constraints

| Concern | Reality in this build |
|---|---|
| Backend interpreter | **`/opt/anaconda3/bin/python3`** — the default `python3` lacks SQLAlchemy |
| Backend start | `scripts/host.sh start` (detached), or `uvicorn app.main:app --port 8000` |
| Frontend start | `npm run dev` in `frontend/` (port 3000) |
| Database file | `backend/autopark.db` (root `autopark.db` is stale — no `users` table) |
| Camera → backend | plain HTTP on the LAN, no auth on `/api/detection/*` |
| Browser → backend | JWT bearer for account routes; occupancy routes are open |
| Public exposure | none — LAN only |

> **Report note:** state the interpreter constraint honestly if asked about
> reproducibility. It is an environment issue, not an architectural one, and it is
> fixed by pinning the interpreter in `scripts/host.sh`.

---

## 5. Dependency reality check

`backend/requirements.txt` currently lists:

```
fastapi, uvicorn[standard], sqlalchemy, pydantic, python-multipart,
opencv-python-headless, numpy, pillow, pytest, httpx, pyjwt, bcrypt
```

It **omits** the two packages the ANPR pipeline actually needs at runtime:

| Missing | Consequence | Fix |
|---|---|---|
| `ultralytics` | `import YOLO` fails; detector falls back or runs degraded | add `ultralytics>=8.3` |
| `easyocr` | no OCR reader; plate reading returns no candidates | add `easyocr>=1.7` |

On the current machine `/health` reports `"easyocr": false`, so the fallback path is
what runs. **This must be fixed before submission** if the report claims live ANPR,
because a fresh `pip install -r requirements.txt` will not reproduce the system.

**Fix (do this before the viva):**

```bash
/opt/anaconda3/bin/python3 -m pip install ultralytics easyocr
# then add both lines to backend/requirements.txt
```

Verify with:

```bash
curl -s http://localhost:8000/health | python3 -m json.tool
# expect: "yolo_plate_model": true, "easyocr": true
```

---

## 6. Alternatives summary table (for the literature/design chapter)

| Decision | Chosen | Main alternative | Reason for rejection |
|---|---|---|---|
| Occupancy sensing | Gate ANPR | per-bay ultrasonic | linear cost, invasive retrofit |
| Plate localisation | YOLOv11 | Haar cascade / contour heuristics | brittle under lighting and angle |
| OCR | EasyOCR | Tesseract | weaker on unconstrained scene text; EasyOCR returns confidence |
| Backend | FastAPI | Flask / Django | async + typed models + OpenAPI for free |
| DB | SQLite | PostgreSQL | ops overhead; single-lot scale |
| Realtime | WebSocket | SSE / polling | one channel for all clients; bidirectional ready |
| Frontend | Next.js | plain React SPA | routing, layout, deployment story |
| Barrier | SG90 servo | solenoid latch / buzzer only | cheap, visual, PWM-controlled |
| Auth | JWT | server sessions | stateless; simple for browser + API split |
