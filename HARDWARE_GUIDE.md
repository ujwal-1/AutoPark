# AutoPark Smart Parking System - Complete Hardware & Setup Guide

This comprehensive guide details the hardware assembly, wiring, FTDI programmer setup, Arduino IDE configuration, firmware flashing, and step-by-step physical demonstration for **AutoPark**.

---

## 1. Components & Hardware Checklist

| Component | Quantity | Purpose / Notes |
| :--- | :---: | :--- |
| **ESP32-CAM (AI-Thinker module)** | 2 | 1x Entry Camera, 1x Exit Camera (with OV2640 camera sensors) |
| **SG90 / MG90S Micro Servo Motor** | 2 | 1x Entry Boom Barrier, 1x Exit Boom Barrier (PWM on GPIO 12) |
| **FTDI USB-to-TTL Serial Adapter** | 1 or 2 | FT232RL module (set jumper to **5V** supply power) |
| **Active 5V Buzzer** | 1 | Optional audio chirp on Entry ESP32-CAM (GPIO 13) |
| **Micro-USB Cables** | 1-2 | Connects FTDI programmer / power supply to your Laptop |
| **Jumper Wires (Dupont)** | 12-16 | Female-to-Female & Male-to-Female wires |
| **Popsicle Stick / Cardboard Arm** | 2 | Glued to servo horn as the physical boom barrier gate arm |
| **Laptop** | 1 | Host running FastAPI Backend (Port 8000) & Next.js Frontend (Port 3000) |

---

## 2. Hardware Wiring Diagrams

### A. Entry ESP32-CAM (With Entry Servo Boom Barrier & Optional Buzzer)

> **IMPORTANT:** Power the ESP32-CAM and Servos using the **5V** pin (not 3.3V) for sufficient torque and stable camera operation.

#### 1. Wiring during Flashing / Code Upload Mode:
- **FTDI VCC (5V)** ➔ **ESP32-CAM 5V**
- **FTDI GND** ➔ **ESP32-CAM GND**
- **FTDI TX** ➔ **ESP32-CAM U0R (GPIO 3)**
- **FTDI RX** ➔ **ESP32-CAM U0T (GPIO 1)**
- **ESP32-CAM GPIO 0** ➔ **ESP32-CAM GND** *(Enables Flash Mode — must be connected during boot!)*

#### 2. Wiring during Normal Operation / Demo Mode:
- **Remove jumper from GPIO 0 to GND**
- **Entry Servo Red Wire (VCC)** ➔ **5V External / Breadboard Rail**
- **Entry Servo Brown Wire (GND)** ➔ **ESP32-CAM GND**
- **Entry Servo Orange/Yellow Wire (Signal)** ➔ **ESP32-CAM GPIO 12**
- **Optional Buzzer (+)** ➔ **ESP32-CAM GPIO 13**, **Buzzer (-)** ➔ **GND**
- Press the **RESET** button on the ESP32-CAM to boot.

```
       +------------------------------------+
       |          FTDI Programmer           |
       |  5V    GND    TX    RX             |
       +---|-----|------|-----|-------------+
           |     |      |     |
           |     |      +-----+--- (TX to RX, RX to TX)
           |     |            |
       +---|-----|------------|-----------------------+
       |  5V    GND    U0R   U0T   GPIO 12    GPIO 13  |
       |                              |          |    |
       |          ESP32-CAM           |          |    |
       |           (Entry)            |          +----+---> Optional Buzzer (+ / - to GND)
       |                              |               
       |                              +-------------------> Entry Servo Signal (Orange Wire)
       |                                                    [Servo VCC to 5V, GND to GND]
       |  GPIO 0 -------------------> GND (Only while flashing!)
       +------------------------------------+
```

---

### B. Exit ESP32-CAM (With Exit Servo Boom Barrier)

#### 1. Wiring during Normal Operation:
- **Exit Servo Red Wire (VCC)** ➔ **5V External / Breadboard Rail**
- **Exit Servo Brown Wire (GND)** ➔ **ESP32-CAM GND**
- **Exit Servo Orange/Yellow Wire (Signal)** ➔ **ESP32-CAM GPIO 12**
- Press the **RESET** button on the ESP32-CAM to boot.
- **FTDI VCC (5V)** ➔ **ESP32-CAM 5V**
- **FTDI GND** ➔ **ESP32-CAM GND**
- **FTDI TX** ➔ **ESP32-CAM U0R (GPIO 3)**
- **FTDI RX** ➔ **ESP32-CAM U0T (GPIO 1)**
- **ESP32-CAM GPIO 0** ➔ **ESP32-CAM GND** *(Flash Mode Jumper)*

#### 2. Wiring during Normal Operation:
- **Disconnect GPIO 0 from GND** and press **RESET**.

---

## 3. Arduino IDE Setup & Configuration

1. **Install Arduino IDE** (v2.0 or higher recommended from [arduino.cc](https://www.arduino.cc/en/software)).
2. **Add ESP32 Board Manager URL**:
   - Open **Preferences** (`Cmd + ,` on macOS or `File > Preferences`).
   - Paste the following into **Additional Boards Manager URLs**:
     ```text
     https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
     ```
3. **Install ESP32 Board Package**:
   - Open **Tools > Board > Boards Manager...**
   - Search for **`esp32`** by Espressif Systems and click **Install**.
4. **Install ArduinoJson Library**:
   - Open **Tools > Manage Libraries...**
   - Search for **`ArduinoJson`** (by Benoit Blanchon) and click **Install** (v6.x or v7.x).

---

## 4. Firmware Code Customization & Flashing

Your codebase already includes configured firmware files in `/hardware`:

### Step 1: Find your Laptop's Wi-Fi IP Address
Open terminal on your Mac and run:
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```
*Your active laptop IP is:* `192.168.0.105`.

### Step 2: Edit Firmware Files

1. Open `hardware/entry_esp32cam/entry_esp32cam.ino`:
   ```cpp
   const char* ssid = "YOUR_WIFI_SSID";         // <--- Replace with your Wi-Fi name
   const char* password = "YOUR_WIFI_PASSWORD"; // <--- Replace with your Wi-Fi password
   const char* serverUrl = "http://192.168.0.105:8000/api/detection/entry";
   ```
2. Open `hardware/exit_esp32cam/exit_esp32cam.ino`:
   ```cpp
   const char* ssid = "YOUR_WIFI_SSID";         // <--- Replace with your Wi-Fi name
   const char* password = "YOUR_WIFI_PASSWORD"; // <--- Replace with your Wi-Fi password
   const char* serverUrl = "http://192.168.0.105:8000/api/detection/exit";
   ```

### Step 3: Flash the Boards via Arduino IDE

1. **Board Settings in Arduino IDE**:
   - **Board**: `AI Thinker ESP32-CAM`
   - **Flash Mode**: `QIO`
   - **Partition Scheme**: `Huge APP (3MB No OTA/1MB SPIFFS)`
   - **PSRAM**: `Enabled` (or Disabled if module lacks PSRAM)
   - **Port**: Select the FTDI USB Serial Port (e.g., `/dev/cu.usbserial-XXXX`)

2. **Upload Procedure**:
   - Ensure **GPIO 0 is shorted to GND**.
   - Press the **RESET** button on the ESP32-CAM.
   - Click **Upload** in Arduino IDE.
   - When the console output shows `Connecting........___`, tap the RESET button once if needed.
   - Once output shows `Hard resetting via RTS pin...`, disconnect **GPIO 0 from GND** and press **RESET**.

---

## 5. End-to-End System Execution & Testing

### Step 1: Start the Laptop Backend & Dashboard
You can start both backend and frontend automatically using the provided launcher:
```bash
./start_all.sh
```
Or start them individually:
- **Backend**: `python3 backend/start_backend.py` (Runs on `http://192.168.0.107:8000`)
- **Frontend**: `cd frontend && npm run dev` (Runs on `http://localhost:3000`)

### Step 2: Power On the ESP32-CAMs
- Open **Tools > Serial Monitor** in Arduino IDE (Baud Rate: `115200`).
- You should see logs indicating:
  ```text
  Connecting to Wi-Fi....
  Connected to Wi-Fi. IP: 192.168.0.x
  Camera successfully initialized.
  ```

### Step 3: Test Entry Flow (Vehicle Arrival)
> Entry requires an **advance pre-booking** from the app (`/book`). Unregistered plates are refused by design.

1. Book a bay from the dashboard (e.g. plate `KA05KK0403` → Bay `A2`).
2. Place the vehicle (or the RC car) in front of the **Entry ESP32-CAM**.
3. The ESP32 captures a snapshot and posts it to `POST /api/detection/entry`.
4. The FastAPI backend runs the ANPR pipeline — YOLO finds the plate region,
   EasyOCR reads it, multi-frame voting + fuzzy matching resolves the plate.
5. On a unique match against a `PENDING_ARRIVAL` booking:
   - Backend binds the **pre-booked bay** (e.g. `A2`) and replies:
     `{"status": "allocated", "slot": "A2", "open_barrier": true, "barrier_action": "OPEN", "trigger_buzzer": true}`
   - **Entry ESP32-CAM lifts the SG90 boom barrier to 90° on GPIO 12**, holds 5 s, returns to 0°.
   - Buzzer (GPIO 13) gives a single confirmation chirp, if fitted.
   - Dashboard flips the bay to **ALLOCATED** over WebSocket; the driver's `/pass` shows `BAY A2`.
6. On no match / unreadable plate:
   - Backend replies `{"status": "unauthorized", "open_barrier": false, "barrier_action": "LOCKED"}`.
   - **Barrier stays at 0°**; an alert appears in the Operator Console.

### Step 4: Test Exit Flow (Vehicle Departure)
1. Drive the vehicle in front of the **Exit ESP32-CAM**.
2. The exit camera posts a frame to `POST /api/detection/exit`.
3. Backend matches the plate to the active session, bills the duration, and frees the bay.
4. Response: `{"status": "released", "slot": "A2", "open_barrier": true, "barrier_action": "OPEN"}`.
5. **Exit ESP32-CAM lifts its boom barrier to 90° on GPIO 12**, holds 5 s, lowers.
6. Dashboard returns the bay to **AVAILABLE** and the driver receives the exit receipt.

> **Note:** the dashboard's barrier indicator is inferred from the backend response —
> there is no position-feedback wire from the servo. Trust the arm, not the label.

---

## 6. Software Fallback / Demo Simulation

If the physical hardware isn't connected, demonstrate the full workflow from the
**Operator Console** (`/operator`) → *HIL Diagnostics* drawer:

- **Simulate Pre-Booked Entry** — plate match → bay bound → barrier lift (`90°`).
- **Simulate Unregistered Entry** — barrier stays `0°`, security alert raised.
- **Simulate Vehicle Exit** — session closed, bay freed, receipt issued.
- **Manual Release** — free a specific stuck bay.
- **Emergency Reset** — clear the whole facility to a clean slate.

These call the same endpoints as the cameras (`/api/parking/simulate/*`), so the
database, allocator, billing and WebSocket path are identical — only the frame
capture is skipped.

