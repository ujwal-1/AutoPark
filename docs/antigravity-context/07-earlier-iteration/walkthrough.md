# Walkthrough — AutoPark Smart Parking System

We have designed, built, and verified **AutoPark**, a camera-based smart parking system prototype with real-time slot monitoring, green RC car detection, a BookMyShow-themed light mode dashboard, and dual ESP32-CAM firmware integration.

---

## 🌟 Key Accomplishments

### 1. High-Performance FastAPI Backend
- **Thread-Safe Atomic Allocation Engine**: Guarantees zero double-allocation across concurrent entry requests using mutex locking.
- **YOLO & HSV Detection Pipeline**: Supports live frame uploads (`/api/detection/entry`, `/api/detection/exit`) and identifies `green_rc_car` using HSV color thresholding + bounding box calculation.
- **Strict PRD Safety Rules**:
  - **Entry ESP32-CAM #1**: Triggers buzzer only when slot allocation succeeds (`trigger_buzzer=True`).
  - **Exit ESP32-CAM #2**: Has **NO BUZZER**. Release mechanism clears active sessions (`A1 -> AVAILABLE`). If no active session exists, it performs **NO action** (prevents unintended slot releases).
  - **Debouncing & Cooldown**: Implements detection cooldown to prevent duplicate frame allocations.
  - **Parking Full Handling**: Returns `PARKING FULL` when all 8 slots (A1-A4, B1-B4) are occupied.
  - **Demo Controls**: Features `/api/parking/reset` and `/api/parking/release/{slot_id}` for live demonstrations.

### 2. BookMyShow-Themed Light Mode Dashboard (Next.js)
- **Visual Grid Layout**: Seat-booking style interactive grid displaying Zone A (A1-A4) and Zone B (B1-B4).
- **BookMyShow Color Tokens**:
  - `#F5F5F7` Slate White Background
  - `#333545` / `#2B3148` Premium Header & Card Slate
  - `#F84464` BookMyShow Crimson Red Branding & Active Session Badges
  - `#2DC492` Emerald Green for Available Parking Slots
- **Live Ticket Notification Banner**: Ticket-styled popup model indicating assigned slot (e.g., `SLOT ASSIGNED: A1`).
- **Live Camera & Activity Log**: Real-time event log with timestamps and detection confidence metrics.
- **Demo Triggers**: Buttons to simulate Green Car Entry, Exit, Manual Slot Release, and Demo Reset.

### 3. ESP32-CAM Firmware & Setup Guide
- **[entry_esp32cam.ino](file://~/AutoPark/hardware/entry_esp32cam/entry_esp32cam.ino)**: Ingests OV2640 frames, posts JPEG to FastAPI backend, drives GPIO 12 active buzzer on successful allocation.
- **[exit_esp32cam.ino](file://~/AutoPark/hardware/exit_esp32cam/exit_esp32cam.ino)**: Exit camera firmware (no buzzer).
- **[HARDWARE_GUIDE.md](file://~/AutoPark/HARDWARE_GUIDE.md)**: Complete step-by-step documentation for components, FTDI pinout, Arduino IDE configuration, flashing instructions, and physical demo walkthrough.

---

## 📸 Visual Demonstration

![BookMyShow Dashboard Screenshot](~/.gemini/antigravity-ide/brain/3d96d371-51a1-4164-b307-8298576c66a4/entry_slot_allocated_1789837666171.png)

---

## 🧪 Verification & Automated Test Results

All 8 backend unit & integration test scenarios pass with 100% success rate:

```bash
$ PYTHONPATH=backend pytest backend/tests/test_api.py -v
tests/test_api.py::test_entry_allocation_success PASSED
tests/test_api.py::test_duplicate_vehicle_entry PASSED
tests/test_api.py::test_exit_release_success PASSED
tests/test_api.py::test_exit_safety_rule_no_active_session PASSED
tests/test_api.py::test_low_confidence_ignored PASSED
tests/test_api.py::test_parking_full_scenario PASSED
tests/test_api.py::test_demo_reset PASSED
tests/test_api.py::test_manual_release PASSED
======================== 8 passed in 1.14s =========================
```

---

## 🚀 How to Run the System

To start both the FastAPI backend and Next.js frontend:

```bash
cd ~/AutoPark
./start_all.sh
```

- **Backend API**: `http://192.168.0.107:8000` (or `http://localhost:8000`)
- **Interactive Dashboard**: `http://localhost:3000`
- **Hardware Guide**: Check [HARDWARE_GUIDE.md](file://~/AutoPark/HARDWARE_GUIDE.md) for full circuit diagrams and flashing steps.
