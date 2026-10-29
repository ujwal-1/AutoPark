## 7.1 Summary of the work

This project set out to test a single proposition: that the sensing hardware of a smart
parking facility need not scale with the number of bays. The result is AutoPark, a
working six-bay system in which two ESP32-CAM nodes at the entry and exit gates replace a
sensor in every space, and in which occupancy is a derived property of the database
rather than a measurement.

The implementation comprises four layers. At the edge, two camera nodes capture a VGA
frame every five seconds, upload it over HTTP, and rotate an SG90 boom barrier to 90°
for five seconds when the server authorises passage. On the server, a FastAPI
application owns all state: it runs the recognition pipeline, decides admission,
allocates bays, times sessions and computes charges. In the browser, a Next.js client
renders the lot for drivers and staff and stays synchronised through a WebSocket channel.
In the database, five tables record users, bays, bookings, sessions and detection events,
so that every decision can be reconstructed afterwards.

The design balances guaranteed pre-reservations with spontaneous arrivals. A pre-booked
vehicle is admitted and routed directly to its held bay, while a walk-in vehicle is
automatically allocated the lowest-numbered available bay. Low confidence readings,
unresolved ambiguity and attempts when the facility is full leave the barrier closed.
This ensures that advance bookings cannot be hijacked and that the occupancy state is
consistently maintained across entries and exits.

## 7.2 Objectives achieved

The eight objectives stated in Chapter 1 were each tied to a verification method. The
table below records the outcome.

| Objective | Outcome | Evidence |
|---|---|---|
| O1 Detect and read plates from gate frames | Implemented; per-stage diagnostics expose quality, candidates and failure stage | Pipeline inspection; `/api/anpr/diagnostics` |
| O2 Authorise pre-booked and walk-in vehicles | Verified | T6 (unknown plate handled), T7 (ambiguous refused) |
| O3 Honour the bay chosen at booking | Verified, after fixing a defect in the allocator | T1 and T2 |
| O4 Derive occupancy from gate events | Verified | T4, T5, layout and summary checks |
| O5 Control a physical barrier automatically | Contract verified; bench actuation test pending | T2 and T4 `open_barrier` flags; firmware truth table |
| O6 Provide real-time visibility | Verified | WebSocket events observed on three clients |
| O7 Produce auditable billing | Verified at both tariff boundaries | T4 (₹30 at 60 min), T8 (₹50 at 61 min) |
| O8 Demonstrate without hardware | Verified | Simulator used throughout tests T2–T8 |

The automated suite executes fifteen checks against an isolated database and passes all
of them. Four defects were found and fixed during validation, including the two that
mattered most: entry ignored the bay chosen at booking, and the receipts page crashed on
a response-shape mismatch. Both now have regression tests.

## 7.3 Contribution

The contribution of the project is architectural and procedural rather than algorithmic.
YOLO, EasyOCR, servos and REST APIs are standard components; nothing in this report
claims otherwise. What is offered is:

1. **A constant-cost sensing architecture.** Two gate cameras serve any number of bays,
   with occupancy inferred from entry and exit events. The marginal sensing cost of an
   additional bay is zero, and the retrofit touches only the gates.

2. **A refusal-by-default authorisation policy.** Four independent gates — confidence,
   plate length, existence of a match, and uniqueness of that match — decide admission.
   Ambiguity is defined numerically and resolved by refusing.

3. **OCR-aware plate matching.** Canonicalisation of visually confusable characters,
   Levenshtein distance on the residual string, and confidence weighting allow a single
   character error to be tolerated without merging two genuinely different plates.

4. **An auditable end-to-end pipeline.** Recognition evidence, allocation, actuation,
   billing and real-time notification are integrated, and every decision is recorded.
