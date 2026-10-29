This chapter turns the problem statement into testable requirements, then examines
whether the requirements can be met with the available hardware and skills.

## 3.1 Actors

| Actor | Interaction with the system |
|---|---|
| Driver | Registers, pre-books a bay or enters as a walk-in, arrives at the entry gate, collects a receipt at exit |
| Operator / security staff | Monitors the lot, inspects recognition diagnostics, releases a stuck bay, resets the facility |
| Entry camera node | Captures frames, uploads them, opens the entry barrier on command |
| Exit camera node | Captures frames, uploads them, opens the exit barrier on command |
| Facility owner | Consumes occupancy and revenue records; not a direct user of the interface |

## 3.2 Functional requirements

Each requirement is stated so that it can be verified by a test or by inspection. The
identifier in the first column is used in the traceability matrix in Chapter 7.

| ID | Requirement | Acceptance criterion |
|---|---|---|
| FR-01 | A driver shall be able to register and sign in with a username and password | A valid registration returns a token; invalid credentials are rejected with HTTP 401 |
| FR-02 | A signed-in driver shall be able to pre-book a bay, optionally choosing a specific bay | The response names the requested bay; the bay becomes ALLOCATED immediately |
| FR-03 | The system shall refuse a booking when the requested bay is held by another vehicle | HTTP 400 with the bay identifier in the message |
| FR-04 | The system shall refuse a second active booking for the same user or the same plate | HTTP 400 naming the existing bay |
| FR-05 | The system shall capture a frame at the entry gate at a fixed interval | Firmware posts a multipart JPEG every 5 s |
| FR-06 | The system shall locate and read a licence plate from the captured frame | Pipeline returns a candidate list with confidences, or a failure stage |
| FR-07 | The system shall admit pre-booked vehicles to their held bay and dynamically allocate the first available bay to walk-in arrivals | Booked vehicle assigned held bay; walk-in assigned first free bay and admitted; full lot returns `parking_full` |
| FR-08 | The system shall allocate the bay chosen at booking time when it is still free | Entry response slot equals the booked slot |
| FR-09 | The system shall not double-allocate on repeated frames from the same vehicle | Repeat entry returns `already_allocated` without creating a second session |
| FR-10 | The system shall open the barrier only on an explicit authorisation from the server | Firmware opens only when `open_barrier` is true |
| FR-11 | The system shall derive bay occupancy from entry and exit events | Bay status changes only through a session being created or closed |
| FR-12 | The system shall match a vehicle at exit against active sessions and release only that bay | Exit returns the matched slot; other bays are unchanged |
| FR-13 | The system shall compute an itemised charge from the parking duration | 60 min bills ₹30; 61 min bills ₹50; 121 min bills ₹70 |
| FR-14 | The system shall present live availability to the driver and the operator | A state change is visible on all open clients without a page refresh |
| FR-15 | The system shall record every detection outcome with supporting evidence | A diagnostics record exists for each processed frame |
| FR-16 | The system shall allow an operator to release a bay and reset the facility | Manual release frees one bay; reset frees all bays and preserves history |
| FR-17 | The system shall support demonstration without physical cameras | Simulator endpoints produce the same allocation, billing and event path |

## 3.3 Non-functional requirements

| ID | Requirement | Target | How it is addressed |
|---|---|---|---|
| NFR-01 | Correctness of occupancy | No bay shown occupied without an active session | Occupancy derived from the session table only; single-writer allocation under a lock |
| NFR-02 | Safety of authorisation | Zero silent false admits on ambiguous evidence | Four independent refusal gates; ambiguity is a refusal by construction |
| NFR-03 | Responsiveness | Occupancy change visible in under 2 s | WebSocket broadcast on every state transition |
| NFR-04 | Availability | Backend restart does not lose lot state | All state persisted in SQLite; cameras retry every 5 s |
| NFR-05 | Fail-safe behaviour | Barrier stays closed when the backend is unreachable | Firmware opens only on an explicit server boolean |
| NFR-06 | Usability | A driver can find a bay and complete a booking without instruction | Single primary action per card; bay pre-selection carried through the booking form |
| NFR-07 | Auditability | Every decision can be reconstructed after the fact | Detection-event table with plate, confidence, stage and evidence reference |
| NFR-08 | Portability | Runs on commodity hardware on a facility LAN | Python and Node services; no cloud dependency; SQLite file database |
| NFR-09 | Maintainability | Recognition thresholds and slot count configurable without code edits | Central `settings` object and a single slot list |
| NFR-10 | Cost | Sensing hardware independent of the number of bays | Two camera nodes regardless of capacity |

## 3.4 Constraints

| Constraint | Consequence for the design |
|---|---|
| Two hobby-grade camera modules only | Recognition must tolerate compression, motion blur and limited resolution; a refusal path is mandatory |
| Single laptop hosts both services | No horizontal scaling; in-process locking is sufficient but not more |
| Facility LAN, no public address | No TLS, no external payment callback; documented as a limitation |
| SG90 torque and 5 V supply | Lightweight arm only; no position feedback available |
| Academic timeline | Payment gateway integration deferred to future work; walk-in allocation dynamically enabled via `ALLOW_WALKIN_ENTRY` policy |
| Indian plate formats | Matching must tolerate state prefixes, two-line plates and visually confusable characters |

## 3.5 Feasibility

**Technical feasibility.** Every component used is available as an open-source library or
a commodity module: FastAPI and SQLAlchemy for the service layer, OpenCV and a YOLO
plate model for localisation, EasyOCR for recognition, and the Arduino core for the
ESP32-CAM. The integration risk is concentrated in recognition quality on low-cost
hardware, which is why the design includes an explicit refusal path and a diagnostics
interface rather than assuming success.

**Economic feasibility.** The bill of materials is dominated by two ESP32-CAM modules and
two servos; jumper wire, a programmer and mounting material complete the rig. A
conventional design for the same six bays would require six occupancy sensors, six
mounting points and, in most cases, six cable runs. The gate-based design therefore
reduces both the part count and the installation effort, and its marginal sensing cost
for an additional bay is zero.

**Operational feasibility.** The system runs unattended. The only routine human actions
are the exceptions that any gate system has: releasing a bay when a plate could not be
read at exit, and resetting the facility between demonstration runs. Both are exposed in
the operator console and both are recorded.

## 3.6 Scope boundary

The requirements above deliberately exclude two capabilities that a commercial product
would need: online payment processing, and multi-lot management.
Each is excluded because it introduces payment compliance or multi-tenant infrastructure
work that does not test the central hypothesis of the project — that occupancy can be
derived from two gate cameras instead of a sensor per bay. Unreserved walk-in entry is
fully integrated and supported alongside advance reservations.
