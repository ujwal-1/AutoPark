# AutoPark — Complete Project & Hardware Integration Context

> **Date:** November 5, 2026  
> **Status:** Fully operational end-to-end (Hardware + AI Pipeline + Actuators + Web Dashboard)  
> **Git Repository:** `https://github.com/ujwal-1/AutoPark.git` (Branch: `main`)  
> **Target Event:** Final Year Engineering Project & Project Expo (Rajarajeswari College of Engineering)

---

## 1. System Overview & Core Philosophy

AutoPark is a camera-based smart parking management system replacing cost-prohibitive per-bay ultrasonic/magnetic sensors with **two edge vision nodes** (Entry & Exit) coupled with server-side AI (YOLOv11 + EasyOCR).

### Key Architectural Invariants:
1. **Two Cameras Only:** No per-bay hardware sensors. Lot occupancy (6 bays: `A1..A3`, `B1..B3`) is computed purely from camera gate entry/exit events.
2. **Pre-Check-In Required:** Vehicles must be pre-registered on the web platform (`PENDING_ARRIVAL`). Unregistered or walk-in vehicles are denied entry, keeping the barrier locked.
3. **Dedicated Actuator Controller:** Servos are decoupled from camera boards. A NodeMCU ESP8266 acts as a dedicated HTTP barrier controller.
4. **Visual Language:** High-contrast, clean dark/light theme, Plus Jakarta Sans, zero neon-gradient clutter.

---

## 2. Hardware Architecture & Pinout

```
                           ┌───────────────────────────────┐
                           │      FastAPI Backend (Mac)    │
                           │       192.168.0.104:8000      │
                           │      YOLOv11 + EasyOCR        │
                           └───────────────┬───────────────┘
                                           │
                 ┌─────────────────────────┼─────────────────────────┐
                 │ HTTP multipart POST     │ HTTP multipart POST     │ HTTP GET pulse
                 ▼                         ▼                         ▼
      ┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐
      │   Entry ESP32-CAM   │   │   Exit ESP32-CAM    │   │  NodeMCU ESP8266    │
      │    192.168.0.112    │   │    192.168.0.114    │   │    192.168.0.115    │
      │  OV3660 (VGA 640p)  │   │  OV3660 (VGA 640p)  │   │  Barrier Controller │
      └─────────────────────┘   └─────────────────────┘   └──────────┬──────────┘
                                                                     │
                                                   ┌─────────────────┴─────────────────┐
                                                   ▼                                   ▼
                                          Entry Servo (SG90)                  Exit Servo (SG90)
                                            Pin D1 (GPIO 5)                     Pin D2 (GPIO 4)
```

### Pin Connections (NodeMCU ESP8266):
| Component | Wire Color | NodeMCU Pin |
| :--- | :--- | :--- |
| **Entry Servo Signal** | Orange | **D1** (GPIO 5) |
| **Exit Servo Signal** | Orange | **D2** (GPIO 4) |
| **Servo Power (VCC)** | Red | **VIN** (5V power rail from USB) |
| **Servo Ground (GND)** | Brown | **GND** |

---

## 3. Firmware Configuration & Arduino IDE Settings

### ESP32-CAM Firmware (`entry_esp32cam.ino` & `exit_esp32cam.ino`):
- **Arduino IDE Board:** `ESP32 Dev Module` *(Do NOT select "AI Thinker ESP32-CAM" — clones have faulty PSRAM that poisons the heap)*.
- **PSRAM:** `Disabled`
- **Partition Scheme:** `Huge APP (3MB No OTA / 1MB SPIFFS)`
- **Flash Mode:** `DIO` or `QIO`
- **Upload Speed:** `115200`
- **Resolution:** VGA 640×480 in internal DRAM mode.

### Barrier Controller Firmware (`barrier_esp8266.ino`):
- **Arduino IDE Board:** `NodeMCU 1.0 (ESP-12E Module)`
- **Upload Speed:** `115200`
- **Anti-Jitter Fix:** The firmware uses **pulse-and-detach**. When triggered, the servo attaches, sweeps to 90°, holds for 500ms, and calls `detach()`. This stops 50Hz PWM buzzing, eliminates motor heat, and prevents brownouts.

---

## 4. Software Stack & Quick Commands

### Python Environment & Dependencies:
- Backend uses Python at `/opt/anaconda3/bin/python3` (contains `torch`, `torchvision`, `ultralytics`, `easyocr`, `fastapi`, `uvicorn`, `opencv-python`).
- Database: SQLite at `backend/autopark.db`.

### How to Start / Stop Everything:
```bash
cd "/Users/ujwalanand/Desktop/AutoPark /AutoPark"

# Start backend & frontend detached (survives terminal close)
./scripts/host.sh start

# Check status of ports 8000 and 3000
./scripts/host.sh status

# Stop both services
./scripts/host.sh stop

# Live backend logs
tail -f .run/backend.log
```

### URLs:
- **Frontend Dashboard:** [http://localhost:3000](http://localhost:3000) (or LAN `http://192.168.0.104:3000`)
- **API Swagger Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **Barrier Trigger Test:** [http://192.168.0.115/barrier/entry](http://192.168.0.115/barrier/entry)
- **Live Camera Frame View:** [http://localhost:8000/api/anpr/debug-image/entry_raw.jpg](http://localhost:8000/api/anpr/debug-image/entry_raw.jpg)

---

## 5. Dual-Orientation ANPR Pipeline

The ANPR engine (`backend/app/anpr_pipeline.py`) includes **dual-orientation evaluation**:
- Physical camera modules mounted upside down in 3D printed stands are automatically supported.
- The pipeline processes both normal and 180°-rotated crops simultaneously.
- Plate detection runs in **~600ms** with >90% confidence on clean license plates.

---

## 6. Viva / Project Exam Demonstration Protocol

When demonstrating to examiners:
1. **Show Live Deck:** Show [http://localhost:3000](http://localhost:3000) with all 6 bays available.
2. **Negative Test (Security):** Present an unregistered plate or toy car. Show that the barrier remains locked at 0° and slot remains unallocated.
3. **Pre-Check-in:** Open `/book`, pre-register `KA05KK0403` for Bay A1. Status changes to `PENDING_ARRIVAL`.
4. **Authorized Entry:** Present `KA05KK0403` to the Entry camera. ANPR recognizes it, NodeMCU lifts the barrier 90° for 5 seconds, and Bay A1 turns **ALLOCATED** on the dashboard.
5. **Exit & Billing:** Present `KA05KK0403` to the Exit camera. Exit barrier lifts, Bay A1 is freed back to **AVAILABLE**, and digital receipt is generated under `/history`.

> [!TIP]
> For toy car demonstrations, paste a **3.5 cm × 1 cm printed white label** with bold black text (`KA 05 KK 0403`) on the toy car bumper, and adjust the ESP32-CAM lens ring so macro text at 15–20 cm is needle-sharp.
