This chapter positions AutoPark against three bodies of work: how parking occupancy is
sensed, how number plates are recognised, and how gate access and monitoring are
implemented. The aim is not to catalogue the literature but to isolate the gap that this
project addresses.

## 2.1 Occupancy sensing in smart parking

Lin, Rivano and Le Mouël classify smart parking systems by the sensing layer used to
detect the presence of a vehicle [1]. The dominant approach is a sensor per bay: an
ultrasonic, magnetometer, infrared or inductive-loop device mounted in or beside each
space, reporting occupancy to a gateway. These systems are accurate because they measure
the state of each bay directly, and commercial deployments are common in multi-storey
facilities.

The economic structure of that approach is the problem. Every bay requires one device,
one power drop, one mounting point and one more thing that can fail. For a facility with
*n* bays, the sensing layer grows as *O(n)* in capital cost, installation time and
maintenance. Retrofitting an existing unmonitored lot is invasive, because cabling must
reach every space.

A second family of designs uses vision from a vantage point: a camera overlooking a row
or a level, with spaces delineated in the image and a classifier deciding occupancy per
region. This amortises hardware over many bays, but each camera must see the spaces it
serves, so coverage still scales with the geometry of the lot, and occlusion by large
vehicles degrades accuracy. Camera-based occupancy systems also carry privacy and
storage costs because they record the interior of the facility continuously.

Gate-based recognition, the approach taken here, sits between these families. The camera
observes only the entrance and the exit, so two devices serve an arbitrary number of
bays. Occupancy is not measured at all; it is inferred from the sequence of entries and
exits. This is the same principle used by ticket-based and barrier-controlled commercial
car parks, where the ticket count, rather than a sensor, is the occupancy record. The
contribution of this project is to replace the ticket with an automatically recognised
plate, which makes the record auditable without a human at the gate.

## 2.2 Automatic number plate recognition

Automatic number plate recognition (ANPR, also ALPR) has a long literature; Du et al.
survey the classical pipeline of plate localisation, character segmentation and character
recognition [3]. Classical systems rely on edge statistics, morphology and colour cues to
find the plate, then on template matching or a small classifier per character. They work
well under controlled illumination and fixed camera geometry, and degrade quickly when
the plate is small, skewed or unevenly lit.

Two developments changed the practical design. First, single-stage object detectors such
as YOLO reframed localisation as a regression problem solved in one network pass, giving
real-time detection at modest cost [4]. Modern implementations of the family, including
YOLO11, are trained on plate-specific datasets and are accurate enough to replace the
hand-crafted localisation stage entirely [5]. Second, deep-learning OCR engines removed
the need for explicit character segmentation. EasyOCR detects text regions and decodes
them with a recognition network, returning a confidence per token, which makes it
suitable for unconstrained scene text such as a plate photographed by a low-cost camera
[6].

A recognition pipeline assembled from these parts is accurate but not certain. That
distinction matters for access control: a character error rate of a few per cent is
acceptable for a toll audit, but a single wrong admit corrupts the occupancy state of a
lot. The literature on ANPR evaluation therefore reports precision and recall per
condition rather than a single accuracy figure, because performance is strongly
condition-dependent [3].

The design consequence adopted in this project is to treat recognition as evidence rather
than as an answer. Multiple preprocessing variants of the same crop are read
independently, the readings are scored for confidence and agreement, several frames are
accumulated, and the resulting candidates are compared against known registrations using
a string-distance metric [8] rather than a single exact comparison. When the evidence
does not resolve to one registration, the system refuses.

## 2.3 Low-cost edge vision and actuation

The ESP32 family provides a microcontroller with integrated Wi-Fi at a price point that
makes a camera node disposable [9]. The ESP32-CAM variant adds an OV2640 sensor and
PSRAM, enough to capture and upload a VGA JPEG without a companion processor. This class
of device is widely used in IoT prototypes because it removes the need for a single-board
computer at the edge: capture, transport and actuation can all run on one microcontroller.

Actuation at the gate is normally a barrier arm driven by a DC motor, a solenoid or a
hobby servo. A servo is attractive for a prototype because it is position-controlled:
the controller commands an angle rather than a direction, and no limit switches are
needed to stop the arm. The SG90 class of micro-servo is cheap and adequate for a
lightweight arm, at the cost of torque and of having no position feedback to the
controller [10].

The architectural lesson taken from this literature is that the edge device should be a
sensor and an actuator, not a decision maker. Every published deployment that puts
authorisation logic on the camera node struggles to keep state consistent across nodes.
AutoPark therefore keeps all decisions on the server and reduces the firmware to capture,
upload, and move the arm when told.

## 2.4 Real-time monitoring interfaces

Operator dashboards need to reflect state changes within a second or two. The classical
solution is client polling of a REST endpoint [15], which is simple but generates
redundant requests and introduces a polling interval of latency. Server-sent events and
WebSockets invert the direction: the server pushes each transition to connected clients.
For a small number of screens and infrequent events, a single WebSocket channel is both
simpler to operate than a message broker and more responsive than polling.

The relevant design detail, often omitted in student projects, is recovery. A WebSocket
stream does not replay missed messages, so a client that reconnects after a network drop
must re-read a snapshot before resuming the stream. This project implements that
snapshot-then-stream pattern.

## 2.5 Access control, identity and audit

The web tier of a parking product is a conventional authenticated application. JSON Web
Tokens [14] with a server-side signature provide stateless session identity, and password
storage follows the OWASP recommendation of a slow, salted hash [16]. The framework
choices — FastAPI for a typed HTTP API [11], SQLAlchemy for the persistence layer [13],
and Next.js for the client [12] — are unremarkable; they are selected because they
minimise the code needed for the parts of the system that are not the contribution.

The audit requirement is more interesting. A gate system must be able to answer, after
the fact, why a particular vehicle was admitted or refused. That requires recording the
evidence behind each decision, not only its outcome. This is the reason the schema
contains a detection-event table separate from the session table, and the reason the
recognition pipeline exposes per-stage diagnostics.

## 2.6 Research gap

Three observations follow from the survey.

First, occupancy sensing is the cost driver in smart parking, and virtually all published
designs instrument each bay or each zone. Gate-only occupancy inference is used in
practice by ticket-based operators but is rarely treated as an academic design, and its
failure modes are rarely analysed.

Second, ANPR accuracy is usually reported as a single figure, while the property that
matters for access control is the decision error rate — false admits and false rejects —
under a refusal policy. A system that refuses when uncertain has a different error profile
from one that always returns its best guess.

Third, the integration of recognition, authorisation, actuation, billing and real-time
monitoring into one auditable pipeline is where most prototypes stop short.

AutoPark addresses these three points together: a two-camera architecture whose sensing
cost is constant in the number of bays, a refusal-by-default authorisation policy with
OCR-aware matching, and an end-to-end implementation whose decisions are recorded with
evidence.
