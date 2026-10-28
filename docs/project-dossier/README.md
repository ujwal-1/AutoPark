# AutoPark — Final-Year Project Dossier

> **Generated:** 28 October 2026
> **Source of truth:** the code in this repository, not the older chat exports.
> **Purpose:** one place your team can pull accurate, presentation-ready content from
> for the report, the slide deck, the viva and the live demo.

---

## 1. What this dossier is

This is **not** a marketing document. Every number, endpoint, pin and behaviour below
was read out of the running codebase or measured on the running system. Where a
figure has **not** been measured yet, it is marked `[TO MEASURE]` and never invented.

If your older material (conference paper draft, chat exports) disagrees with this
dossier, **this dossier wins** — the older draft claims 8 bays and a 96.4 % precision
figure that were never produced by this code.

---

## 2. Ground-truth specification

Memorise this table. It is what you can defend in a viva.

| Item | As-built value |
|---|---|
| Project name | AutoPark — camera-based smart parking |
| Core idea | Two gate cameras replace per-bay occupancy sensors |
| Parking capacity | **6 bays** — A1, A2, A3 (Zone A), B1, B2, B3 (Zone B) |
| Edge devices | 2 × ESP32-CAM (AI-Thinker), entry gate + exit gate |
| Actuator | SG90 micro-servo boom barrier, **GPIO 12**, 0° closed / 90° open, **5 s hold** |
| Optional actuator | Active buzzer, **GPIO 13** (confirmation chirp only) |
| Camera capture interval | 5 s per gate (firmware loop) |
| Frame size | VGA 640×480 with PSRAM, QVGA 320×240 without |
| Plate detection | YOLOv11 plate model (`backend/models/license_plate_best.pt`) |
| Plate reading | EasyOCR, 4 preprocessing variants, multi-frame voting |
| Backend | FastAPI + Uvicorn, port **8000**, SQLAlchemy + SQLite |
| Database | `backend/autopark.db` (5 tables) |
| Frontend | Next.js 14 (App Router) + React 18 + Tailwind, port **3000** |
| Realtime | WebSocket `/ws/parking` |
| Auth | JWT HS256, bcrypt password hashing, 24 h token |
| Billing | ₹30 for first 60 min, +₹20 per additional started hour |
| Access policy | **Pre-booked vehicles only**; unmatched plates are denied, barrier stays closed |
| Deployment | Facility LAN (dev servers), no public URL / TLS |
| Codebase size | ≈10,300 lines (13 backend modules, 20 frontend pages/components, 2 sketches) |

### Explicitly **not** true (do not claim)

- ❌ 8 bays or A4/B4 — the database is seeded from `settings.SLOTS` = 6 bays.
- ❌ 96.4 % precision / 184 ms inference — no such measurement exists in this repo.
- ❌ Walk-in / unregistered entry — removed by design decision; unmatched plates are refused.
- ❌ "Hosted on the internet" — it runs on the local network only.
- ❌ Per-bay sensors — the whole point is that there are none.
- ❌ Payment gateway — billing is computed and displayed, not charged.

---

## 3. How to use it

### If you are writing the report

Start with **`11-report-outline.md`**. It maps every chapter to the dossier file that
feeds it, gives a page budget, and lists the figures and tables to include.

### If you are building the slides

Use **`12-presentation-deck.md`** — 18 slides, on-slide text already trimmed, speaker
notes written, timings assigned.

### If you are presenting / defending

- **`14-demo-runbook.md`** — minute-by-minute live demo script with fallbacks.
- **`13-viva-qa.md`** — 40 likely examiner questions with short, defensible answers.

### If you need the technical story

| File | Contents |
|---|---|
| `01-project-overview.md` | Abstract, problem, objectives, scope, novelty, elevator pitches |
| `02-system-architecture.md` | Diagrams, data flows, state machines, design decisions |
| `03-technology-stack.md` | Every technology with role, version and justification |
| `04-anpr-pipeline.md` | Plate recognition deep dive: stages, thresholds, scoring, failure modes |
| `05-backend-design.md` | Modules, database schema, API reference, allocation and billing algorithms |
| `06-frontend-design.md` | Pages, design system, realtime behaviour, UX states |
| `07-hardware-integration.md` | BOM, wiring, pin map, firmware lifecycle, bench checklist |
| `08-testing-and-validation.md` | Test strategy, executed test cases, defect log |
| `09-results-and-evaluation.md` | Metric definitions, measurement protocol, result templates |
| `10-limitations-and-future-work.md` | Honest limitations, mitigations, roadmap |
| `15-glossary-and-references.md` | Abbreviations, glossary, IEEE-style references |

---

## 4. Suggested team split

| Member | Owns | Dossier files |
|---|---|---|
| **A — Systems & architecture** | Problem definition, architecture chapter, diagrams, design decisions | `01`, `02`, `03` |
| **B — Computer vision** | ANPR chapter, preprocessing, thresholds, evaluation protocol | `04`, `09` |
| **C — Software** | Backend, database, APIs, frontend, realtime | `05`, `06` |
| **D — Hardware & validation** | Wiring, firmware, assembly, testing, demo | `07`, `08`, `14` |
| **All** | Slides, viva rehearsal, report review | `11`, `12`, `13` |

Each member should be able to explain **their own layer** and the **end-to-end flow**.
Examiners frequently ask a member to explain a layer they did not build.

---

## 5. Claims policy (read before writing a single slide)

Use this three-colour rule for every claim you make:

| Colour | Meaning | Examples |
|---|---|---|
| 🟢 **Green — safe to claim** | Verified in code or on the running system | 6 bays; two-camera design; servo on GPIO 12; 5 s barrier hold; pre-booked-only access; ambiguity refusal; ₹30/+₹20 billing; realtime WebSocket updates |
| 🟡 **Amber — claim only with a measurement** | Implemented, but no number recorded yet | plate recognition accuracy, end-to-end latency, OCR confidence distribution, false-admit rate |
| 🔴 **Red — do not claim** | Not implemented or not measured | 96.4 % precision, 184 ms, 8 bays, walk-in entry, public cloud deployment, online payments |

If an examiner asks for an amber number and you have not measured it, say:

> "That is implemented, but we have not completed the formal measurement yet; the
> evaluation protocol is in our testing chapter and the functional path is verified."

That answer is credible. Inventing 96.4 % is not.

---

## 6. Maintenance rule

Whenever the code changes, update **`README.md` §2** and the affected technical file in
the same commit. The dossier is only useful if it stays true.

**Version:** 1.0 · **Verified against:** running instance at `localhost:8000` / `localhost:3000` on 28 Oct 2026.
