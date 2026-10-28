# AutoPark Implementation Plan: Servo-Driven Boom Barrier & Pre-Booking Gateway

This plan details the full implementation of the **AutoPark Smart Parking System** with **Servo-Motor Boom Barriers at both Entrance and Exit Gates**, powered by dual ESP32-CAMs, YOLOv11 license plate recognition, and real-time app synchronization.

---

## 1. Physical & Digital Workflow

```
[Driver Pre-Books via App] ──> [Database: PENDING_ARRIVAL]
                                            │
                                            ▼
[Vehicle Arrives at Gate] ───> [Entry ESP32-CAM captures frame]
                                            │
                                            ▼
                               [YOLOv11 & OCR Plate Matching]
                                            │
                      ┌─────────────────────┴─────────────────────┐
                      ▼ (Matched Pre-Booking)                     ▼ (Unregistered)
            [Assign Optimal Slot (A1-B3)]                [ACCESS DENIED]
            [Signal Entry Servo: OPEN BOOM BARRIER]      [Barrier Remains DOWN (0°)]
            [Push Bay & Navigator to Driver Phone]       [Security Alert on UI]
                      │
                      ▼
[Vehicle Departs via Exit] ──> [Exit ESP32-CAM captures frame]
                                            │
                                            ▼
                               [Identify Active Session]
                               [Signal Exit Servo: OPEN BOOM BARRIER]
                               [Automatically Free Slot (Green)]
                               [Generate Digital Exit Receipt]
```

---

## Phase 1: Backend API & Gate Barrier Signal Engine

- [x] **1.1 Strict Pre-Booking Gatekeeping (`backend/app/slot_allocator.py`)**
  - Verify plate matching against active `PENDING_ARRIVAL` reservations.
  - Authorized: assign optimal slot, set status `ALLOCATED`, return `open_barrier: true`, `barrier_action: "OPEN"`, `trigger_buzzer: true` (for backward-compatibility).
  - Unauthorized: return `open_barrier: false`, `barrier_action: "LOCKED"`, and deny entry with guidance to pre-book.

- [x] **1.2 Exit Processing & Auto-Billing (`backend/app/slot_allocator.py`)**
  - Exit detection: matches plate to active session, sets session `COMPLETED`, sets bay to `AVAILABLE`.
  - Return `open_barrier: true`, `barrier_action: "OPEN"`, `duration_minutes`, `duration_formatted`, `billed_amount`.

- [x] **1.3 Extended Parking Summary & Status Endpoints (`backend/app/main.py`)**
  - Extend `/api/parking/summary` with `active_bookings`, `barrier_status`.
  - Add `/api/bookings/my-status` support for live active pass and receipts.

---

## Phase 2: Driver Mobile Portal (App Experience)

- [x] **2.1 Driver Home & Live Availability (`frontend/src/app/page.tsx`)**
  - Clean layout with live capacity counters (Total, Available, Reserved, Parked).
  - Prominent `📅 Pre-Book a Parking Slot` action button.
  - Live 2D parking bay status overview (A1–B3).

- [x] **2.2 Advance Pre-Booking Interface (`frontend/src/components/BookingModal.tsx`)**
  - Clean booking modal allowing drivers to enter license plate, vehicle type, and arrival window.
  - Generates instant **Digital Parking Pass** with countdown.

- [x] **2.3 "Active Parking Pass" & Slot Navigator (`frontend/src/components/ActivePassCard.tsx`)**
  - Real-time transition when Entry Boom Barrier opens:
    - High-contrast banner: **`ENTRY BOOM BARRIER OPENED • PROCEED TO SLOT A2`**.
    - Animated directional route from Gate $\rightarrow$ Driveway $\rightarrow$ Assigned Slot.
    - Live parking duration meter and current accrued fee.

- [x] **2.4 Digital Exit Receipt (`frontend/src/components/ExitReceiptModal.tsx`)**
  - Automatically pops up when Exit Boom Barrier opens:
    - Bay used, parked duration, billed amount, and exit timestamp.

---

## Phase 3: Facility Operator & Presentation Console

- [x] **3.1 Clean UI Separation (`Driver Portal` $\leftrightarrow$ `Operator Console`)**
  - Header toggle between **Driver Portal** and **Operator Console**.
  - **Operator View**:
    - **2D Digital Twin Layout**: Bays A1–B3 with real-time status and license plate badges.
    - **Dual Gate Barrier HUD**:
      - Entry Monitor: Camera feed, recognized plate, OCR confidence, and **Entry Boom Barrier state (UP 90° / DOWN 0°)**.
      - Exit Monitor: Camera feed, departed plate, matched session, and **Exit Boom Barrier state (UP 90° / DOWN 0°)**.

- [x] **3.2 Professional HIL (Hardware-in-the-Loop) Test Drawer**
  - Collapsible **"HIL Diagnostics & Gate Simulator"** drawer for viva presentation:
    - `[Simulate Pre-Booked Entry]` $\rightarrow$ tests barrier lift & bay assignment.
    - `[Simulate Unregistered Entry]` $\rightarrow$ tests security lockout (barrier stays closed).
    - `[Simulate Vehicle Exit]` $\rightarrow$ tests exit barrier lift & bay release.
    - `[Emergency Facility Reset]` $\rightarrow$ 1-click clean slate.

---

## Phase 4: ESP32 Firmware & Servo Integration Guide

- [x] **4.1 Firmware Code for Entry & Exit Servo Boom Barrier**
  - Provide tested Arduino C++ code with `ESP32Servo` library for:
    - Entry ESP32-CAM: Servo on GPIO 12/13 (0° closed, 90° open on `open_barrier: true`).
    - Exit ESP32-CAM: Servo on GPIO 12/13 (0° closed, 90° open on `open_barrier: true`).
  - Step-by-step wiring diagrams in `HARDWARE_GUIDE.md`.
