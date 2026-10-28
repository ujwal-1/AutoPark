# 09 — Results and Evaluation

> This chapter tells you **what to measure, how to measure it, and how to report it**.
> It contains the results that exist (functional verification) and clearly labelled
> templates for the results that must still be produced (recognition accuracy, latency).
>
> **Do not fill a template with a guess.** A blank cell defended honestly is stronger
> than a number you cannot reproduce.

---

## 1. What has actually been demonstrated

### 1.1 Functional results (verified)

| Result | Evidence |
|---|---|
| End-to-end booking → entry → allocation → exit → billing works | 15/15 automated checks (Test Report, Section 6.3) |
| The bay chosen at booking is the bay allocated at entry | T1 + T2 |
| Cancelling a booking returns the bay to the pool | T5 |
| Duplicate frames do not double-allocate | T3 |
| Unknown plates are refused and the barrier stays closed | T6 |
| Two plausible bookings cause a refusal, not a guess | T7 |
| Billing changes correctly at the hour boundary | T4 (₹30) and T8 (₹50 at 61 min) |
| Six-bay occupancy is derived from gate events | layout/summary checks after T2/T4 |
| The web application exposes live state on all routes | U1–U8 |
| The barrier command is explicit and fail-closed | `open_barrier` true only on `allocated` / `released` |

### 1.2 Engineering metrics (measured from the repository)

| Metric | Value | How |
|---|---|---|
| Parking capacity | 6 bays | `settings.SLOTS` |
| Edge camera nodes | 2 | firmware directories |
| REST routes | 22 | `main.py` route decorators |
| WebSocket channels | 1 (`/ws/parking`) | `main.py` |
| Database tables | 5 | `models.py` |
| Backend modules | 13 | `backend/app/*.py` |
| Frontend pages | 8 | `frontend/src/app/**/page.tsx` |
| Frontend components | 11 | `frontend/src/components` |
| Total source lines | ≈10,266 | backend `.py` + frontend `.ts/.tsx` + `.ino` |
| Hardware cost scaling | O(1) in bays | architectural comparison |

---

## 2. Metrics that must still be measured

These definitions are used consistently throughout this report.

| Metric | Definition | Unit |
|---|---|---|
| **Plate detection rate (PDR)** | frames where a plate box is found ÷ frames containing a plate | % |
| **Exact recognition rate (ERR)** | readings exactly equal to ground truth ÷ frames with a detected plate | % |
| **Fuzzy recognition rate (FRR\*)** | readings accepted by the matcher as the correct vehicle ÷ frames with a detected plate | % |
| **False admit rate (FAR)** | unauthorised vehicles admitted ÷ unauthorised attempts | % |
| **False reject rate (FReR)** | authorised vehicles refused ÷ authorised attempts | % |
| **End-to-end latency** | camera POST start → JSON response received | ms (p50 / p95) |
| **Barrier actuation delay** | JSON received → arm reaches 90° | ms |
| **Availability** | time backend answers `/health` ÷ observation window | % |

\* Do not call this "accuracy" without qualification; define exactly what is counted.

### 2.1 Sampling protocol

1. **Plates.** Use at least 5 distinct plates, including two that differ by one
   character (e.g. `KA05KK0403` and `KA05KK0404`) — this is what exercises the
   ambiguity rule.
2. **Conditions.** For each plate, capture frames under four conditions:
   daylight, low light, angled (≈30°), and motion blur.
3. **Count.** At least 10 frames per plate-condition pair → ≥200 frames total.
4. **Ground truth.** Record a CSV: `frame, plate_truth, condition`.
5. **Run.** POST each frame to `/api/detection/entry` with a known booking state, or run
   the pipeline offline and log `status`, `plate_number`, `confidence`, `failure_stage`.
6. **Score.** Compute PDR, ERR, and the matcher-accepted rate. Report **per condition**,
   not only as an overall average — the per-condition table is what makes the result
   credible.

### 2.2 Latency protocol

Instrument the backend (or use the diagnostics timing block) to record:

```
t0 = request received
t1 = plate detected
t2 = OCR complete
t3 = match + DB commit complete
t4 = response written
```

Report `t4 − t0` as p50/p95 over ≥30 runs and state the hardware used
(machine CPU, camera resolution, frame size). A latency number without hardware context
is meaningless.

### 2.3 Results template (to fill after measurement)

**Table 9.x — Recognition performance by condition**

| Condition | Frames | Plate detected % | Exact match % | Matcher accepted % |
|---|---|---|---|---|
| Daylight, frontal | | | | |
| Low light | | | | |
| Angled ≈30° | | | | |
| Motion blur | | | | |
| **Overall** | | | | |

**Table 9.y — Decision outcomes**

| Outcome | Count | Rate |
|---|---|---|
| Correct admit (authorised vehicle) | | |
| Correct reject (unknown plate) | | |
| Correct hold (ambiguous) | | |
| False admit | | |
| False reject | | |

**Table 9.z — Latency**

| Stage | p50 | p95 |
|---|---|---|
| Frame POST → plate detected | | |
| Plate detected → OCR complete | | |
| OCR → decision committed | | |
| **Total end-to-end** | | |

> If the examiner asks "what is your accuracy?" and the table is empty, the correct
> answer is: *"The functional path is verified end-to-end; the recognition measurement is
> designed but not yet completed. Our design target is high precision, because the system
> refuses when uncertain."* Then show the refusal tests, which you **do** have.

---

## 3. System-level evaluation (argument, not measurement)

These analytical results hold without further measurement.

### 3.1 Hardware scaling

Let `n` be the number of bays.

| Architecture | Sensing devices | Cabling points | Cost growth |
|---|---|---|---|
| Per-bay sensor | `n` | `n` | linear |
| AutoPark | 2 (fixed) | 2 | constant |

For the pilot (`n = 6`), a per-bay design needs **6 sensors**; AutoPark needs **2
cameras**. The marginal sensing cost of adding a seventh bay is **zero** in AutoPark and
one sensor plus installation in the conventional design. This is the project's central
quantitative claim and it is exact, not estimated.

### 3.2 State-space correctness

The occupancy invariant is:

```
bay is OCCUPIED ⇔ ∃ session s : s.status = ACTIVE ∧ s.slot_id = bay.id
```

Every transition is one of:

- entry authorised → create ACTIVE session (T2),
- exit matched → close session (T4),
- operator reset/release → close session (documented).

There is no path that creates a second ACTIVE session for the same bay, because
allocation is serialised by `allocation_lock` and only selects `AVAILABLE` bays. This is
an argument about the code, and it is checkable by inspection.

### 3.3 Refusal behaviour

The system has four independent refusal gates:

1. confidence < 0.75,
2. fewer than 4 plate characters,
3. no matching booking,
4. ambiguous match (gap < 0.10).

All four were exercised or inspected; two are covered by T6 and T7. Multiple independent
gates are expected to keep the false-admit rate low, but that expectation is not a
result: the rate must be measured with the protocol in §6.9.

---

## 4. Comparison with related approaches

| Approach | Occupancy accuracy | Hardware per bay | Retrofit effort | Cost scaling | Audit trail |
|---|---|---|---|---|---|
| Manual attendant | high | none | none | labour | paper |
| Per-bay ultrasonic/IoT | high | sensor + power + mount | high | linear | digital |
| Overhead camera CV (lot-wide) | medium–high | 1 camera per zone | medium | stepwise | digital |
| **AutoPark (gate ANPR)** | derived | **none** | **gate only** | **constant** | **digital** |

The honest positioning: AutoPark is not more accurate than per-bay sensing. It is
**cheaper to scale and less invasive to retrofit**, at the cost of dependence on plate
reads. That sentence belongs in the abstract and the conclusion.

---

## 5. Threats to validity

List these in the report; examiners respect them.

| Threat | Effect | Mitigation |
|---|---|---|
| Small plate sample | accuracy estimate may not generalise | report per condition; state sample size |
| Single site / lighting | results tied to one installation | describe setup precisely |
| Synthetic/simulated entries | do not test OCR | separate functional tests from recognition tests |
| One operator | no inter-rater check on ground truth | double-check a 20 % sample |
| EasyOCR absent on dev machine | live ANPR not exercised here | install and rerun before submission |
| Camera mounting variability | angle changes recognition | fixed mount + documented distance |
| Clock skew | duration/billing edge cases | both entry and exit use server UTC time |

---

## 6. How to present results on a slide

Three slides maximum:

1. **"What works"** — the 15/15 functional suite, as a compact table or a single big
   number with the test IDs listed.
2. **"What we measured"** — recognition table (only if filled) or the scaling argument
   with the `n` vs `2` comparison.
3. **"What we refuse to claim"** — the refusal gates and the honest limitation. This
   slide builds more credibility than any accuracy number.

---

## 7. Minimum viable evaluation (if time is short)

If you cannot run the full 200-frame protocol, do this instead and label it clearly as a
**pilot**:

- 5 plates × 4 conditions × 3 frames = 60 frames.
- Report PDR and matcher-accepted rate only.
- Report one latency run of 10 frames with p50.
- State the limitation explicitly.

A small, honest pilot beats an invented 96.4 %.
