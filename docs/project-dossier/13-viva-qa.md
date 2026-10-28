# 13 — Viva Preparation

> 40 questions an examiner is likely to ask, with short answers you can defend.
> Answers are deliberately conservative: they claim only what the code and tests support.

---

## A. Architecture

**1. Why two cameras instead of a sensor in every bay?**
Because sensing cost should not scale with capacity. A per-bay design needs one device,
one power drop and one mount per bay; AutoPark needs two gate cameras regardless of bay
count. The trade-off is that occupancy becomes dependent on plate reads, which we manage
with refusal rules and manual override.

**2. How do you know a bay is free?**
A bay is `OCCUPIED` if and only if an `ACTIVE` session references it. Entry creates the
session, exit closes it. The database is the source of truth; the frontend only renders it.

**3. What if a vehicle exits and the plate is not read?**
The session stays `ACTIVE` and the bay stays occupied. That is the honest cost of the
design. The operator can release the bay manually, and the action is auditable. A
timeout-based flag is listed as future work.

**4. Isn't that a serious flaw?**
It is a deliberate trade-off, not an oversight. Direct sensing removes that failure but
reintroduces linear hardware cost, which is the problem we set out to solve. We state the
failure mode, provide a mitigation, and do not hide it.

**5. Where does the decision to open the barrier happen?**
In the backend, never in the firmware. The camera sends a frame; the backend returns
`open_barrier: true` only for `allocated` or `released`. Any other status leaves the arm
at 0° (fail-closed).

---

## B. ANPR and matching

**6. Why YOLO plus OCR instead of OCR on the whole frame?**
Separating localisation from recognition reduces background text and lets each stage be
tuned or replaced independently. Whole-frame OCR is noisy and slower.

**7. Why EasyOCR and not Tesseract?**
EasyOCR handles unconstrained scene text and returns per-token confidence, which the
scoring stage needs. Tesseract is strong on clean scanned documents, weaker on angled,
low-resolution camera frames.

**8. What does the preprocessing do?**
Four variants: adaptive threshold, inverted adaptive, Otsu, and CLAHE. They cover uneven
lighting, light-on-dark plates, clean high-contrast plates, and low-contrast frames. The
best candidates are voted across variants.

**9. How do you combine OCR results?**
`score = 0.70 × max_confidence + 0.30 × agreement_ratio`, where agreement is the fraction
of the four variants that produced the same reading. Confident and consistent wins.

**10. How do you handle a misread `O` versus `0`?**
Canonicalisation maps I/L/J→1, O/Q/D→0, Z→2, S→5, B→8, G→6 before comparison. A single
visual confusion therefore still matches, at a slightly lower score (0.92).

**11. What if the reading is one character off?**
Levenshtein distance 1 is accepted on plates of length ≥ 4, scored 0.85 for length ≥ 6
and 0.75 for length 4–5. The score is then discounted by OCR confidence.

**12. How do you avoid admitting a similar plate?**
Two independent protections: the match must be unique, and if the top two candidates are
within 0.10 of each other the result is **ambiguous** — a refusal. We also refuse plates
shorter than four characters and confidence below 0.75.

**13. Why 3 frames over 5 seconds?**
One frame is one sample. Three frames let a candidate be corroborated across frames while
staying within a car's approach time. A reading seen in 3 of 3 frames outranks one seen
once.

**14. What is your accuracy?**
The functional path is verified end-to-end; formal recognition accuracy has not yet been
measured. We have a protocol: ≥ 200 labelled frames across four lighting/angle conditions,
scored for detection rate, exact match and matcher-accepted rate. I can show the protocol
and the per-condition table. *(If you have completed it, quote the measured numbers and
the sample size — never a bare percentage.)*

**15. What is the latency?**
We measure it as camera POST to JSON response, reported as p50/p95 on stated hardware.
*(Quote only if measured.)* The pipeline cost is dominated by YOLO and OCR; the matching
logic is negligible.

---

## C. Backend, data and security

**16. Why SQLite?**
Zero operational overhead for a single-lot prototype, and it survives restarts. The
SQLAlchemy models make a PostgreSQL migration straightforward if scale demands it.

**17. What happens if two cars arrive at once?**
Allocation is serialised by a lock; a bay is only selected if it is `AVAILABLE`, then
marked occupied in the same critical section. Duplicate frames are further suppressed by
an active-session check and a 10-second per-plate cooldown.

**18. Does that hold with multiple server workers?**
No, and that is a known limitation. The lock and cooldown live in process memory. The fix
is a database-level row lock or a unique partial index allowing one ACTIVE session per
slot. We run a single worker.

**19. How are passwords stored?**
bcrypt hashes. Plaintext is never stored. Tokens are JWTs signed with HS256, valid for
24 hours.

**20. Is the operator console authenticated?**
Not currently — control routes are open so the demo and cameras can call them without a
token. It is acceptable on an isolated facility LAN and it is listed as a security
limitation. The fix is a device key for camera routes and an admin role check for control
routes.

**21. Where is billing computed?**
Server-side, from `entry_time` and `exit_time`. The client may display an estimate for an
in-progress session, but the backend value is authoritative. A client cannot change the
amount.

**22. What is the billing rule?**
₹30 for the first 60 minutes, then +₹20 for each additional started hour:
`30 + ((minutes − 1) // 60) × 20`. At 61 minutes it is ₹50; at 121 minutes, ₹70.

**23. What is the WebSocket for?**
Pushing state changes to the deck, pass and operator screens. On reconnect the client
re-reads a REST snapshot, because WebSocket messages are not replayed.

---

## D. Hardware

**24. Why a servo and not a solenoid?**
A servo gives positional control (0°/90°) and a visible arm, is cheap, and is easy to
drive from the ESP32 with PWM. A solenoid is binary and needs a driver stage.

**25. Why GPIO 12?**
It is free on the AI-Thinker camera pinout. GPIO 13 carries the optional buzzer. Using a
camera-used pin would conflict with the image sensor.

**26. Why 5 V for the servo?**
Torque. At 3.3 V the SG90 stalls or jitters. The servo is powered from a separate 5 V rail
with a common ground and a decoupling capacitor.

**27. What if the arm does not move?**
There is no position feedback, so the system cannot detect a stall. The UI reports the
commanded state, not a measured one. A limit switch is future work. On the bench, verify
the 5 V rail and the PWM timer allocation first.

**28. Why hold for 5 seconds?**
It is a fixed, conservative window for a car to pass. It is a parameter, and an adaptive
hold using a loop sensor is listed as future work.

**29. What happens if Wi-Fi drops?**
The firmware retries every 5 seconds. Frames fail, the barrier stays closed, and the lot
state is unchanged. A reconnect resumes capture on the next interval.

---

## E. Results and evaluation

**30. How did you test it?**
Three levels: an isolated automated suite (15 checks covering booking, allocation,
duplicate suppression, exit, cancellation, refusal, ambiguity and billing), UI checks,
and bench tests for the servo. The automated suite runs against a temporary database so it
cannot disturb demo data.

**31. Show me a test that proves the system refuses rather than guesses.**
Test T7: two bookings `KA05KK0403` and `KA05KK0404`, a reading `KA05KK0405`. The reading
is one edit from both, so the system returns `ambiguous` and the barrier stays closed.
That is the core safety property.

**32. What is the most important defect you found?**
Entry ignored the bay chosen at booking and allocated the first free bay. It was fixed by
binding `slot_id` at booking and preferring it at entry, and it is now a regression test
(T1 + T2). We also found and fixed a crash on the receipts page caused by an API shape
mismatch.

---

## F. Novelty, scope and the future

**33. What is novel here? Components like YOLO and EasyOCR are standard.**
The contribution is architectural and policy-level: constant-cost occupancy sensing for a
multi-bay lot, and a refusal-by-default authorisation policy with OCR-aware matching.
We do not claim to have invented ANPR.

**34. Why no walk-in entry?**
It was a deliberate scope decision: without a reservation-buffer policy, walk-ins create
double-allocation and fairness problems. The future-work design reserves a fixed
percentage of bays and only admits walk-ins while `free − pending − reserve > 0`.

**35. How would you deploy this for real?**
Add a lot identifier and multi-lot schema, move to PostgreSQL, put the API behind TLS with
device authentication, add payments, and add position feedback or a loop sensor for the
barrier. The core decision engine would not change.

**36. What about privacy?**
Plates are personal data. In a real deployment we would need retention limits, access
control on the audit log, encryption at rest, and a stated purpose. The prototype stores
plate images only as local debug evidence.

---

## G. Questions that test ownership

**37. Which part did you personally build?**
Answer truthfully and specifically. Name the file or subsystem, one decision you made,
and one problem you solved. "I did the frontend" is weak; "I built the booking-to-bay
binding and fixed the regression where entry ignored the booked bay" is strong.

**38. What would you do differently with another semester?**
Pick two: measure recognition properly, implement the walk-in reservation policy, add
device authentication, or add barrier feedback. Explain the trade-off, not just the wish.

**39. Why is the UI monochrome?**
High contrast survives bad projectors, reads as infrastructure software rather than a
template, and state is conveyed by label plus colour so it still works in print and for
colour-blind users.

**40. What is the one sentence you want us to remember?**
"A bay is free if and only if a vehicle entered and has not left — so two cameras can
replace a sensor in every bay."

---

## Things not to say

| Don't say | Say instead |
|---|---|
| "96.4 % accuracy" (unless measured) | "Functional path verified; recognition measurement protocol defined" |
| "8 bays" | "6 bays: A1–A3, B1–B3" |
| "It's hosted online" | "It runs on the facility LAN" |
| "Walk-in works" | "Access is pre-booked only; walk-in is future work" |
| "The servo confirms it opened" | "The backend commands the barrier; there is no position feedback" |
| "It's fully secure" | "Authentication covers accounts; control routes are LAN-only and listed as a limitation" |
| "AI decides" | "A deterministic rule engine decides; ML is used for detection and OCR" |

The last row matters: examiners are suspicious of "the AI decides". Be precise about
where learning is used (YOLO, OCR) and where rules are used (authorisation, allocation,
billing).
