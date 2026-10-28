# 12 — Presentation Deck

> 18 slides · ~15 minutes · monochrome theme matching the product.
> Each slide gives the **on-slide text**, the **visual**, and the **speaker notes**.
> Keep on-slide text short; the notes are what you actually say.

---

## Slide 1 — Title (30 s)

**On slide**

```
AUTOPARK
Camera-based smart parking with ANPR-gated boom barriers

Final Year Project · <Department> · <College>
Team: <names>   Guide: <name>   <Month Year>
```

**Visual:** the barrier glyph / product wordmark on near-black.
**Say:** one sentence: "We built a parking system where two gate cameras replace a sensor
in every bay."

---

## Slide 2 — The problem (45 s)

**On slide**

```
Drivers can't see free bays before arriving
Operators can't see occupancy without walking the lot
Manned gates cost labour; per-bay sensors cost ~n devices

→ Availability, access and billing are still manual
```

**Visual:** a photo of a crowded lot or a simple cost-vs-bays line chart.
**Say:** "The obvious fix is a sensor in every bay. It works, but cost, cabling and
maintenance scale with capacity. For a small lot that is hard to justify."

**Do not say:** any city-wide statistic you cannot cite. If you cite Shoup's ~30 %
cruising figure, name the source.

---

## Slide 3 — The idea (45 s)

**On slide**

```
Two cameras. Two gates. No bay sensors.

Entry camera  → who is this, and may they enter?
Exit camera   → who is leaving, and what do they owe?

Occupancy is derived, not measured.
```

**Visual:** lot diagram with two camera icons at the gates and six bays with no devices.
**Say:** "A bay is free if and only if a vehicle entered and has not left. That is a
database fact, not a sensor reading."

---

## Slide 4 — Objectives (45 s)

**On slide**

```
1  Read plates from gate frames
2  Admit only pre-registered vehicles
3  Honour the bay the driver booked
4  Derive occupancy from gate events
5  Drive a physical barrier
6  Show state in real time
7  Bill and receipt automatically
8  Demonstrate without hardware
```

**Visual:** eight numbered chips, 4 × 2.
**Say:** read them quickly; do not explain each. "These eight became our test
traceability matrix."

---

## Slide 5 — Architecture (60 s)

**On slide**

```
Edge       2 × ESP32-CAM  (capture 5 s, servo, optional buzzer)
Backend    FastAPI + SQLite  (all decisions, all state)
Frontend   Next.js 14  (driver + operator, WebSocket)
Actuator   SG90 on GPIO 12  (0° closed, 90° open, 5 s)
```

**Visual:** the four-tier diagram from `02-system-architecture.md` §3.
**Say:** "Cameras are sensors, not controllers. If a camera is replaced, the lot state is
untouched. If the backend is down, the barriers fail closed."

---

## Slide 6 — Booking flow (45 s)

**On slide**

```
Driver picks plate, duration, bay
Booking immediately locks the bay (ALLOCATED)
expires_at = now + duration
Guaranteed hold — not a preference

Cancel → bay returns to the pool
```

**Visual:** booking sequence diagram (simplified to 4 boxes).
**Say:** "This is the decision that makes the rest simple: a booked bay is removed from
the available pool at booking time, not at arrival."

---

## Slide 7 — ANPR pipeline (75 s)

**On slide**

```
Frame → quality gate → YOLOv11 plate box → 4 preprocessing variants
      → EasyOCR → candidate scoring → 3-frame burst vote
      → match against bookings → ALLOW / DENY / HOLD
```

**Visual:** pipeline diagram with the four variants shown as thumbnails of one plate.
**Say:** explain the two ideas that matter: (1) multiple preprocessing variants because
no single binarisation wins, (2) burst voting because one frame is one sample.
Mention the 70/30 score: 70 % OCR confidence, 30 % cross-variant agreement.

---

## Slide 8 — The decision policy (75 s)

**On slide**

```
Admit only on a unique match.

confidence < 0.75        → ignore
plate < 4 characters     → refuse
no matching booking      → refuse
two matches within 0.10  → refuse (ambiguous)
```

**Visual:** four traffic-light rows, all ending in "barrier stays closed".
**Say:** "This is the core design choice. A false admit corrupts occupancy, billing and
the audit trail. A false reject costs one retry. So when evidence is insufficient, we
refuse." Give the two-bookings-one-edit-apart example.

**This is the slide examiners remember. Slow down here.**

---

## Slide 9 — Bays and allocation (45 s)

**On slide**

```
Booked bay wins over lowest-numbered bay
Duplicate frames suppressed: active-session check + 10 s cooldown
Entry:  ALLOCATED → OCCUPIED, session ACTIVE
Exit:   session COMPLETED, bay AVAILABLE
```

**Visual:** bay state machine (three states).
**Say:** "We had a real bug here — entry used to ignore the booked bay and allocate the
first free one. The fix was to bind `slot_id` at booking and prefer it at entry. It is
now a regression test."

---

## Slide 10 — Hardware (45 s)

**On slide**

```
ESP32-CAM (VGA with PSRAM) + SG90 servo
Servo signal: GPIO 12 · 5 V rail · common ground
0° closed → 90° open → 5 s hold → 0°
Barrier opens only on open_barrier = true
```

**Visual:** wiring photo and pin table side by side.
**Say:** mention fail-closed and the 5 V current requirement. Then the honest note:
"there is no position feedback, so the UI shows the commanded state, not a measured one."

---

## Slide 11 — The web application (45 s)

**On slide**

```
Live Deck     availability, zones, search, activity
Pre-Book      bay selection, plate, duration
Active Pass   "BAY A2" — the payoff
Receipts      sessions, totals, itemised invoice
Operator      digital twin, cameras, diagnostics, HIL
```

**Visual:** a 3-up screenshot strip (Deck / Pass / Operator).
**Say:** "The pass screen is the moment the system becomes useful to a driver: it tells
them exactly where to go."

---

## Slide 12 — Realtime (30 s)

**On slide**

```
WebSocket /ws/parking
13 event types (slot, booking, vehicle, barrier, refusal)
Reconnect → REST snapshot, then resume stream

No polling. No refresh button required.
```

**Visual:** event fan-out diagram.
**Say:** "Three screens stay consistent because the backend broadcasts every transition.
On reconnect we re-read a snapshot, because WebSocket messages are not replayed."

---

## Slide 13 — Live demo (2–3 min) — optional slot

**On slide**

```
1  Reset lot          4  Exit + receipt
2  Book B3            5  Unauthorised plate → stays closed
3  Entry → servo 90°  6  Operator console
```

**Visual:** the actual application, full screen.
**Say:** follow `14-demo-runbook.md`. If hardware fails, use the HIL simulator and say so
plainly — the simulator calls the same endpoints, so the logic shown is real.

---

## Slide 14 — Testing (60 s)

**On slide**

```
15 / 15 automated checks passed
booking · entry · duplicate · exit · cancel · refusal · ambiguity · billing

8 UI checks · 11 defects logged · 6 fixed

Hardware bench tests: to be reported after the bench run
```

**Visual:** the result table (green PASS column).
**Say:** highlight T7 ambiguity and T8 billing boundary. "We test the refusals as hard as
the happy path."

---

## Slide 15 — Results: the scaling argument (45 s)

**On slide**

```
Per-bay design:  n sensors, n cable runs
AutoPark:        2 cameras, independent of n

Pilot n = 6  →  2 cameras instead of 6 sensors
7th bay adds 0 sensing hardware
```

**Visual:** two bar charts: devices vs bays (linear) and AutoPark (flat).
**Say:** "This is exact, not estimated. It is the project's central quantitative claim."

**If you have recognition numbers, put them on the next slide — not here.** Do not mix a
measured accuracy figure with an architectural argument.

---

## Slide 16 — Limitations (45 s)

**On slide**

```
Occupancy is inferred → unreadable exit can strand a bay
Pre-booked only → no walk-ins (deliberate policy)
Single lot · no payments · LAN only · no servo feedback
```

**Visual:** a simple two-column "trade-off" table: what we gain / what we give up.
**Say:** "The stuck-bay case is the honest cost of removing per-bay sensors. We mitigate
it with audited manual release and reset. We would rather state it than be caught by it."

---

## Slide 17 — Future work (30 s)

**On slide**

```
Near:   install EasyOCR, measure accuracy, walk-in policy
Next:   multi-lot · PostgreSQL · payments · device auth
Later:  anti-spoofing · adaptive barrier hold · PWA
```

**Visual:** roadmap line with three horizons.
**Say:** one sentence each. Do not read the list.

---

## Slide 18 — Conclusion (30 s)

**On slide**

```
Two cameras instead of a sensor per bay
Admit only on a unique match
Occupancy, billing and audit derived from gate events

Hardware cost is constant with lot size.
```

**Visual:** the title slide image, dimmed.
**Say:** close on the insight, thank the panel, invite questions.

---

## Timing plan

| Block | Slides | Time |
|---|---|---|
| Problem & idea | 2–3 | 1:30 |
| Objectives | 4 | 0:45 |
| Architecture & flow | 5–6 | 1:45 |
| ANPR & policy | 7–9 | 3:15 |
| Hardware & UI | 10–12 | 2:00 |
| Demo | 13 | 2:30 |
| Testing & results | 14–15 | 1:45 |
| Limitations & future | 16–17 | 1:15 |
| Conclusion | 18 | 0:30 |
| **Total** | | **~15:15** |

---

## Five-minute version

Keep slides **1, 3, 5, 7, 8, 14, 18** only.

1. Title — 15 s
2. Idea — 45 s
3. Architecture — 45 s
4. ANPR pipeline — 60 s
5. Decision policy — 60 s
6. Testing — 60 s
7. Conclusion — 30 s

The decision-policy slide is never cut. It is the project's thesis.

---

## Deck design rules

- Same palette as the app: `#09090B` background, white text, one accent per state.
- **Maximum 6 bullets per slide, maximum 10 words per bullet.**
- No paragraph text on slides. The notes carry the explanation.
- One idea per slide; if a slide needs two diagrams, it is two slides.
- Use monospace for plates, bays, pins and money.
- Every number must be traceable to a test or the code — no decorative statistics.
- Rehearse with a timer; the demo is the only part allowed to overrun.
