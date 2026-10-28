# 14 — Live Demo Runbook

> Target: **8–10 minutes**, one driver flow, one refusal, one receipt, one operator
> moment. Rehearse it twice. The demo is the only part of the viva you can fully control.

---

## 1. T-60 minutes: setup checklist

| Check | Command / action | Expected |
|---|---|---|
| Services running | `./scripts/host.sh status` | port 8000 UP, port 3000 UP |
| Backend health | `curl -s localhost:8000/health` | `"status": "healthy"` |
| Models | same response | `"yolo_plate_model": true` (and `easyocr: true` if installed) |
| Frontend | open `http://localhost:3000` | Live Deck renders |
| LAN access | open `http://<LAN-IP>:3000` on your phone | page loads |
| Camera power | 5 V adapters connected, common ground | servo holds 0°, no jitter |
| Camera serial | Arduino IDE serial monitor @115200 | Wi-Fi + camera init + `0° (Closed)` |
| Camera target IP | top of each `.ino` | matches the laptop's **current** LAN IP |
| Booking login | sign in on the laptop | `/pass` loads |

> **Most common failure:** the laptop's IP changed and the firmware still points at the
> old one. Check `ipconfig getifaddr en0` and update `SERVER_HOST` if needed.

---

## 2. T-15 minutes: clean state

```bash
# 1. Free every bay, close every session, keep history
curl -s -X POST http://localhost:8000/api/parking/reset

# 2. Verify a clean lot
curl -s http://localhost:8000/api/parking/summary
# expect: total 6, available 6, active_sessions 0

# 3. Sanity-check the logic suite (uses its own DB, does not touch demo data)
./scripts/verify_system.sh 8012
# expect: PASS=15 FAIL=0
```

Then open these tabs, in this order:

1. `http://localhost:3000/` — Live Deck
2. `http://localhost:3000/book?slot=B3` — Pre-Book with B3 preselected
3. `http://localhost:3000/pass` — Active Pass
4. `http://localhost:3000/operator` — Operator Console
5. `http://localhost:8000/docs` — only if an examiner asks for the API

Set browser zoom so the bay grid is readable on the projector.

---

## 3. The script

### Step 1 — Frame the problem (30 s)

> "This is AutoPark. Normally a smart lot needs a sensor in every bay. We use two cameras
> at the gates and derive occupancy from entry and exit. Six bays here, but the sensing
> hardware does not grow with the number of bays."

Show the Live Deck: six bays, all available.

### Step 2 — Book a specific bay (60 s)

1. Click **Pre-Book Bay** on **B3** (or use the preselect tab).
2. Enter a plate, e.g. `KA05KK0403`.
3. Duration 2 hours.
4. Submit.

> "The bay is locked the moment the booking is created — it is not a preference. Watch
> B3 change from available to reserved on the deck."

**Point at:** B3 now `RESERVED` while the others remain `VACANT`.

### Step 3 — Entry (90 s)

1. Put the car (or the plate) in front of the **entry** camera.
2. Watch the serial monitor: HTTP 200 → JSON → `LIFTING ENTRY BARRIER (90°)`.
3. The arm lifts, holds 5 s, lowers.
4. Switch to `/pass`.

> "The camera posted a frame; the backend ran the plate pipeline; the plate matched
> exactly one booking; the bay was bound and the barrier was commanded open. The pass now
> shows the bay the driver booked."

**Point at:** `BAY B3` on the pass, and B3 `OCCUPIED` on the deck.

### Step 4 — Exit and receipt (90 s)

1. Move the car to the **exit** camera.
2. Serial: `EXIT CONFIRMED FOR SLOT B3 — LIFTING GATE`.
3. Open `/history` (or the pass receipt).

> "Exit matched the active session, released B3, and computed the bill: thirty rupees for
> the first hour. The receipt is itemised and stored."

**Point at:** B3 back to `AVAILABLE`, receipt modal, amount.

### Step 5 — Refusal (60 s) — **do not skip**

1. Go to `/operator` → **Simulate Unregistered Entry** (or present an unbooked plate).
2. Show the alert and the barrier **not moving**.

> "This is the part that matters. No booking, no entry. The barrier stays at zero and an
> alert is raised. We refuse rather than guess."

Optionally mention T7: two similar bookings produce `ambiguous`, also a refusal.

### Step 6 — Operator view (45 s)

1. Stay on `/operator`.
2. Point at the digital twin, camera status, and the diagnostics drawer.

> "The operator sees the same state, plus the last decision, the quality grade and the
> candidate readings. Manual release and reset are here for exceptions."

### Step 7 — Close (30 s)

> "Two cameras instead of a sensor per bay, a refusal-by-default authorisation policy, and
> occupancy, billing and audit derived from gate events. Thank you."

---

## 4. Fallback plans

### A. Hardware does not respond

Use the HIL simulator. Say this, explicitly:

> "The hardware is not responding on this network, so I'll use our hardware-in-the-loop
> simulator. It calls the same endpoints as the camera — the allocation, database, billing
> and WebSocket path are identical; only frame capture is skipped."

Then: `/operator` → **Simulate Authorised Entry** → show the bay and pass → **Simulate
Vehicle Exit** → show receipt.

**Do not** pretend the hardware worked. The simulator is a legitimate part of the build
and is listed as objective O8.

### B. OCR fails on the live camera

1. Check the diagnostics drawer: is the frame blurry, dark, or is no plate found?
2. Adjust the camera angle or lighting and retry once.
3. If it still fails, say: "The frame quality is below our threshold, so the system is
   correctly refusing. I'll demonstrate the decision path through the simulator."
4. Do not lower the threshold in front of the panel.

### C. Backend or frontend crashed

```bash
./scripts/host.sh start     # restarts both, ~20 s
curl -s localhost:8000/health
```

While it restarts, talk through the architecture slide. Never debug silently in front of
the panel.

### D. Booking fails because the bay is taken

That is the system working. Say "B3 is already held — the bay is locked at booking time,"
pick another bay, and move on.

---

## 5. Recovery commands

| Problem | Command |
|---|---|
| Backend down | `./scripts/host.sh start` |
| Port in use / stale process | `./scripts/host.sh stop && ./scripts/host.sh start` |
| Logs | `./scripts/host.sh logs` |
| Dirty demo state | `curl -X POST localhost:8000/api/parking/reset` |
| One stuck bay | `curl -X POST localhost:8000/api/parking/release/A2` |
| Verify logic after a change | `./scripts/verify_system.sh 8012` |

---

## 6. What to have open in the background

- Terminal 1: `./scripts/host.sh logs` (backend output, ANPR decisions)
- Terminal 2: Arduino serial monitor (firmware decisions)
- Browser tab: `/operator` (diagnostics + simulator)
- This runbook, printed or on a phone

The serial monitor is your best evidence during the demo: it shows the exact JSON the
backend returned and the barrier decision the firmware took.

---

## 7. Post-demo

1. Reset the lot if the next session needs a clean state.
2. Note anything that failed and add it to the defect log.
3. If a panel member asks a question you could not answer, write it down and follow up in
   the report/Q&A.

---

## 8. Demo anti-patterns

| Don't | Why |
|---|---|
| Book all six bays "to show it works" | Leaves you no room to demonstrate a second flow |
| Demo the happy path only | The refusal is the most defensible part of the project |
| Apologise for the simulator | It is a designed feature (O8), not a workaround |
| Improvise a code change live | Guarantees a broken demo |
| Quote an accuracy number you cannot show | One question destroys the credibility of everything else |
| Let the screen sleep / notifications appear | Turn on Do Not Disturb, disable sleep |
