# 01 — Project Overview

> Report-ready copy. Sections marked **[PASTE]** are written to be dropped into the
> report with minimal editing.

---

## 1. Title

**AutoPark: A Camera-Based Smart Parking System with Automated Number Plate Recognition and Micro-Actuated Boom Barriers**

Short form: **AutoPark — ANPR-gated smart parking**

---

## 2. Abstract **[PASTE]**

> Finding a free parking space in dense commercial and campus environments is slow,
> wasteful and difficult to monitor. Conventional "smart" parking installations solve
> the visibility problem by instrumenting every bay with an ultrasonic, magnetic or
> infrared sensor, which multiplies hardware cost, cabling and maintenance with lot
> size. This project presents AutoPark, a smart parking system that replaces per-bay
> sensing with **two camera nodes at the entry and exit gates**. Each node captures a
> frame every five seconds, transmits it to a FastAPI backend, and the backend locates
> the licence plate with a YOLOv11 detector and reads it with EasyOCR using four
> preprocessing variants and multi-frame voting. A plate is only accepted when it
> matches exactly one pre-registration; ambiguous or unknown plates are refused and
> the barrier remains closed. On a valid match the allocated bay is bound to the
> session, an SG90 servo lifts the boom barrier to 90° for five seconds, and all
> connected clients are updated over WebSocket. Exit is handled symmetrically: the
> plate is matched against active sessions, the bay is released, and an itemised
> receipt is produced. Because occupancy is derived from entry and exit events rather
> than measured per bay, the system's hardware cost is constant with respect to lot
> size. The implementation comprises a six-bay facility, a real-time Next.js
> dashboard, a role-aware operator console, a monochrome design system, and a
> hardware-in-the-loop simulator for demonstration without physical cameras.

**Keywords:** smart parking, automatic number plate recognition, YOLOv11, EasyOCR,
edge IoT, ESP32-CAM, boom barrier, FastAPI, real-time systems.

---

## 3. Problem statement **[PASTE]**

> Parking search is a systems problem, not a space problem. Drivers cannot see which
> bays are free before arriving, operators cannot see occupancy without walking the
> lot, and mechanical or manned gates add recurring labour cost. The two common
> remedies are both unsatisfactory at small and medium scale. Per-bay sensors give
> accurate occupancy but require one device, one power drop and one mounting point per
> bay, so cost grows linearly with capacity. Fully manual gates are cheap to install
> but cannot provide live availability, audit trails or automated billing.
>
> There is therefore a gap for a system that provides **live bay availability,
> automated access control and auditable billing** with hardware that does **not scale
> with the number of bays**.

---

## 4. Motivation

- **Driver experience.** Arriving without knowing availability causes circling, delay
  and congestion. Parking-search traffic has been estimated at roughly 30 % of traffic
  in congested commercial districts [2].
- **Operator economics.** Every additional bay in a sensor-per-bay design adds a
  device, a cable run and a failure point. A gate-only design adds **zero** marginal
  sensing hardware per bay.
- **Accountability.** A plate-indexed audit trail links every entry, exit and charge to
  a vehicle, which manned gates cannot produce.
- **Practicality for a campus.** A six-bay pilot is representative of a department
  lot, is buildable with hobby-grade hardware, and exercises every part of the real
  system: authorisation, actuation, billing and monitoring.

---

## 5. Aim

To design, implement and validate a smart parking system in which **occupancy is
inferred from gate events rather than measured per bay**, while preserving accurate
availability, controlled access and auditable billing.

---

## 6. Objectives

| # | Objective | How it is met in the build | How it is evidenced |
|---|---|---|---|
| O1 | Detect and read vehicle plates from gate frames | YOLOv11 plate detector + EasyOCR with 4 preprocessing variants and 3-frame voting | Working pipeline; per-stage diagnostics API |
| O2 | Authorise only pre-registered vehicles | Unique match against `PENDING_ARRIVAL` bookings; refuse unknown/ambiguous plates | Simulated unauthorised entry keeps barrier closed |
| O3 | Honour the bay the driver booked | Booking binds `slot_id`; entry allocator prefers that bay | Executed test: B3 requested → B3 allocated |
| O4 | Derive occupancy from gate events | Slot state machine driven by entry/exit only | Layout, summary and WebSocket events consistent after entry/exit |
| O5 | Control a physical barrier automatically | SG90 servo, 0°/90°, 5 s hold, gated on backend `open_barrier` | Firmware logic + API contract verified |
| O6 | Provide real-time visibility | WebSocket broadcast to dashboard, pass and operator console | Live updates without refresh |
| O7 | Produce auditable billing | Duration computed at exit; ₹30 first hour, +₹20 per started hour | Receipts page and exit response verified |
| O8 | Allow demonstration without hardware | Hardware-in-the-loop simulator calling the same endpoints | Authorised / unauthorised / exit / reset flows |

> **Note for the report:** objectives should be restated in the past tense in the
> results chapter ("O1 was met; O3 was verified by test T-04").

---

## 7. Scope

### In scope

- One parking facility with six bays across two zones.
- Two gate camera nodes (entry, exit) with servo barriers.
- Pre-booking through a web application with bay selection.
- Plate-based entry authorisation and exit release.
- Real-time dashboard, driver pass, receipts and operator console.
- Billing computation and receipt generation.
- Simulation mode for demonstration.

### Out of scope (and why)

| Excluded | Reason |
|---|---|
| Walk-in / unregistered entry | Deliberately removed to keep the access policy unambiguous: no booking, no entry. Re-enabling it requires a reservation-buffer policy, which is listed as future work. |
| Online payment | Adds a payment-gateway integration and compliance surface with no bearing on the core contribution. Billing is computed and itemised, not charged. |
| Multi-level / multi-lot management | The architecture generalises, but a second lot multiplies hardware and is unnecessary to demonstrate the concept. |
| Native mobile app | The web app is responsive and installable in a browser; a native client is a packaging exercise. |
| Per-bay sensors | Excluded by design — this is the hypothesis under test. |

---

## 8. Proposed solution

```
Driver books a bay  →  Booking locks the bay (ALLOCATED)
        ↓
Car reaches entry gate  →  ESP32-CAM posts a frame
        ↓
YOLO locates plate  →  EasyOCR reads it  →  burst voting  →  fuzzy match
        ↓                                             ↓
unique booking                                   no / ambiguous match
        ↓                                             ↓
bay bound · session ACTIVE · servo 90°          barrier stays 0° · alert
        ↓
Driver sees "BAY A2" on /pass
        ↓
Car reaches exit gate  →  plate matched to ACTIVE session
        ↓
bay released · bill computed · servo 90° · receipt
```

The single most important sentence for the viva:

> **A bay is free if and only if a vehicle has entered and not yet left — the database,
> not a sensor, is the source of occupancy truth.**

---

## 9. Novelty and contribution

1. **Gate-only occupancy inference for a multi-bay lot.** Occupancy is a derived state
   over entry/exit events, so sensing hardware is O(1) in the number of bays instead of
   O(n). Most student and commercial systems instrument each bay.
2. **Refusal-by-default authorisation.** The system is designed to *deny* when evidence
   is insufficient. Low confidence, short readings, ambiguous matches and unknown
   plates all leave the barrier closed. This inverts the usual "best effort admit"
   behaviour of demo ANPR systems.
3. **OCR-aware plate matching.** Canonicalisation of visually confusable characters
   (O/0, I/1, S/5, B/8, Z/2, G/6) combined with Levenshtein distance and a
   confidence-weighted score lets `KA05KK0403` match `KA05KK04O3` without merging two
   genuinely different plates.
4. **End-to-end integration.** Detection, authorisation, actuation, billing, realtime
   UI and a hardware simulator are one coherent system rather than disconnected demos.

> **Framing tip:** do not claim the individual components are new — YOLO, OCR and
> servos are standard. Claim the **architecture** and the **policy** are the
> contribution.

---

## 10. Stakeholders and personas

| Persona | Need | System response |
|---|---|---|
| **Driver** | Know a bay is waiting; get in without talking to anyone | Pre-book, guaranteed bay, pass screen, barrier opens on plate match |
| **Operator / security** | See the lot, handle exceptions, release stuck bays | Operator console: live bays, camera status, diagnostics, manual release, reset |
| **Facility owner** | Lower hardware cost, audit trail, revenue record | Two cameras regardless of bay count; per-session receipts; detection event log |
| **Project evaluator** | Verify claims, see failure behaviour | Diagnostics endpoint, evidence capture, explicit refusal paths, simulation controls |

---

## 11. Elevator pitches

### 20 seconds

> AutoPark is a smart parking system that uses two cameras at the gates instead of a
> sensor in every bay. The plate decides who gets in, which bay they get, and when it
> is freed — so hardware cost stays flat as the lot grows.

### 60 seconds

> Most smart parking systems put an ultrasonic sensor in every bay. That works, but
> cost, cabling and maintenance scale with the number of spaces. AutoPark inverts the
> problem: two ESP32-CAM nodes watch the entry and exit gates, a YOLOv11 + EasyOCR
> pipeline reads the plate, and the backend derives occupancy from entry and exit
> events. A vehicle is admitted only if its plate uniquely matches a pre-booking;
> ambiguous or unknown plates are refused and the boom barrier stays down. The driver
> sees their assigned bay in real time, and on exit the bay is released and an
> itemised receipt is generated. The whole facility is six bays, but the architecture
> does not care how many bays there are.

### 2 minutes

> Add to the 60-second version: the failure philosophy. Nothing is admitted on a guess.
> Confidence below 0.75, a reading shorter than four characters, two bookings matching
> within 0.10 of each other, or a plate that matches no booking all result in a refusal
> and an operator alert. That is deliberate: a false admit corrupts occupancy, while a
> false reject only costs the driver one more attempt. We also built a hardware-in-the-
> loop simulator that calls the same endpoints as the cameras, so the entire flow can be
> demonstrated and marked even if the hardware fails on the day.

---

## 12. Deliverables

| # | Deliverable | Location |
|---|---|---|
| D1 | Working web application (driver + operator) | `frontend/` |
| D2 | REST + WebSocket backend | `backend/app/` |
| D3 | ANPR pipeline | `backend/app/anpr_pipeline.py`, `yolov11_detector.py` |
| D4 | Entry and exit firmware | `hardware/entry_esp32cam/`, `hardware/exit_esp32cam/` |
| D5 | Hardware wiring and assembly guide | `HARDWARE_GUIDE.md` |
| D6 | Six-bay database with seeded slots | `backend/autopark.db` |
| D7 | Test evidence and demo runbook | `08-testing-and-validation.md`, `14-demo-runbook.md` |
