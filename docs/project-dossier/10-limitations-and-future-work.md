# 10 — Limitations and Future Work

> A limitations section is not a confession. It is evidence that you understand your own
> system boundary. Examiners reward specificity; they punish overclaiming.

---

## 1. Current limitations

### L1 — Walk-in dynamic allocation policy (implemented)

**What:** Spontaneous walk-in entry is supported via `ALLOW_WALKIN_ENTRY`. When an unreserved vehicle arrives, the allocator assigns the lowest-numbered available bay, opens the barrier, and highlights the bay on the live deck. If all bays are occupied, it signals `parking_full`.
**Policy consideration:** Pre-booked slots take precedence; walk-in admissions draw exclusively from unreserved, available bays.
**Mitigation:** Live WebSocket updates ensure driver immediately sees their assigned slot on their device or gate terminal upon entry.

### L2 — Occupancy is inferred, not measured

**What:** if a vehicle exits and its plate is never read, the bay remains `OCCUPIED`.
**Why:** there is no per-bay sensor by design.
**Consequence:** one unreadable exit can strand a bay until an operator intervenes.
**Mitigation today:** manual release (`POST /api/parking/release/{slot}`) and full reset,
both audited; the UI exposes them.
**Fix:** see §2.2.

### L3 — Recognition depends on OCR availability and image quality

**What:** the current development machine reports `"easyocr": false`; `requirements.txt`
omits `easyocr` and `ultralytics`.
**Consequence:** a clean install does not reproduce live ANPR; the automated suite
therefore validates decision logic, not OCR accuracy.
**Fix:** install both packages, pin them in `requirements.txt`, rerun the measurement
protocol.

### L4 — Single facility, six bays

**What:** one lot, one slot table, one WebSocket channel.
**Consequence:** no multi-lot or multi-level model; `lot_id` does not exist.
**Fix:** add a `lots` table and scope slots, sessions and broadcasts by `lot_id`. The
architecture generalises; the schema does not yet.

### L5 — No payment integration

**What:** the bill is computed and shown; no money moves.
**Consequence:** cannot claim a commercial billing system.
**Fix:** integrate a payment gateway (e.g. Razorpay/Stripe test mode) and store a payment
reference on the session. Keep the pricing engine server-side.

### L6 — Security hardening incomplete

| Issue | Risk | Fix |
|---|---|---|
| Default JWT secret in `config.py` | token forgery | require `JWT_SECRET` at startup |
| No TLS | token and plate data in clear text | reverse proxy with TLS |
| Detection/control routes unauthenticated | anyone on LAN can simulate entry | shared device key (`X-Device-Key`) for camera routes; admin auth for control |
| No rate limiting | brute-force login | limit attempts per IP/user |
| No token revocation | stolen token valid for 24 h | short-lived access + refresh rotation |

### L7 — Concurrency model is single-process

**What:** `allocation_lock` and the cooldown map live in process memory.
**Consequence:** multiple Uvicorn workers could interleave allocations.
**Fix:** database-level locking (`SELECT … FOR UPDATE`) or a unique partial index that
allows at most one ACTIVE session per slot, plus a shared cache (Redis) for cooldowns.

### L8 — SQLite write concurrency

**What:** one writer at a time; WAL not explicitly configured.
**Consequence:** fine for six bays and a handful of clients; not for a large deployment.
**Fix:** PostgreSQL with the same SQLAlchemy models (minimal code change).

### L9 — No barrier position feedback

**What:** the servo is open-loop; the UI shows the *commanded* state.
**Consequence:** a stalled arm can be reported as open.
**Fix:** add a limit switch or IR beam at the arm and report actual position.

### L10 — Fixed 5-second barrier hold

**What:** the arm closes after 5 s regardless of vehicle speed.
**Consequence:** a slow vehicle may be hit by the arm (in a real installation).
**Fix:** loop detector or second camera frame to confirm passage before lowering.

### L11 — No anti-spoofing

**What:** a printed plate photograph could be presented to the camera.
**Consequence:** access control can be defeated in principle.
**Fix:** vehicle fingerprinting (make/colour), a second factor (QR/NFC), or liveness cues.

### L12 — No native mobile app / offline mode

**What:** responsive web only; requires network connectivity.
**Consequence:** no push notifications, no offline pass.
**Fix:** PWA wrapper with cached pass; push via service worker.

### L13 — Repository hygiene

**What:** `node_modules` and `.next` are tracked (13,612 files, ~600 MB); two full
`backend_backup_*` copies exist; the root `autopark.db` is stale.
**Consequence:** clone/zip is slow; a new contributor may edit the wrong copy.
**Fix:** untrack build artifacts, add `.gitignore` entries, delete backups after tagging
a release.

### L14 — Documentation drift

**What:** an earlier conference-paper draft claims 8 bays and 96.4 % precision / 184 ms.
**Consequence:** submitting it would contradict the code.
**Fix:** use this dossier as the source of truth; correct the paper to 6 bays and remove
unmeasured numbers.

---

## 2. Future work

### 2.1 Re-enabling walk-in entry (highest-value extension)

The design question is not technical, it is policy: **how many bays are held back for
arrivals?**

A defensible rule:

```
free_now            = bays AVAILABLE
pending_bookings    = bookings PENDING_ARRIVAL
walkin_reserve      = ceil(0.20 × total_bays)        # policy knob
free_for_walkins    = free_now − pending_bookings − walkin_reserve
admit_walkin if free_for_walkins > 0
```

Implementation sketch:

1. On entry with no booking, compute `free_for_walkins`.
2. If positive, create an on-the-spot booking + session for that plate and allocate the
   lowest-numbered free bay.
3. If zero, return `parking_full` (not `unauthorized`) so the display can say "lot full"
   instead of "not registered".
4. Add a `source` column to sessions (`PREBOOKED` / `WALKIN`) for reporting.
5. Test the boundary: exactly `walkin_reserve` bays free → refuse walk-ins, keep
   pre-bookings honoured.

**Why this is a good viva answer:** it shows you understand that the hard part is
reservation policy, not code.

### 2.2 Stuck-bay recovery

Options, in increasing sophistication:

1. **Operator release with reason** (exists) — add a reason code and an audit entry.
2. **Timeout policy** — if a bay is OCCUPIED for longer than the booked duration + grace,
   flag it for review rather than auto-freeing it (auto-freeing risks a double-booking).
3. **Exit re-scan flow** — a kiosk at the exit lets the driver re-present the plate; the
   system matches by bay + partial plate.
4. **Occupancy reconciliation** — periodic manual walk-through in the operator UI.

### 2.3 Recognition improvements

| Idea | Expected benefit | Cost |
|---|---|---|
| Fine-tune the plate detector on local plates | higher PDR | labelled data + training time |
| Character-level segmentation + per-character confidence | better handling of partial reads | engineering |
| Temporal tracking across frames (not just voting) | ties a burst to one vehicle | moderate |
| Vehicle colour/make fingerprint | anti-spoofing + second factor | model integration |
| Indian HSRP format validation (state + district + series) | rejects impossible readings | rule engine |
| GPU inference | lower latency | hardware |

### 2.4 Product features

- Multi-lot support with a lot selector and per-lot dashboards.
- Reservation expiry notifications (push/email) before `expires_at`.
- Dynamic pricing (peak/off-peak) with the same server-side engine.
- Monthly passes and fleet accounts.
- Native/PWA app with an offline QR pass.
- Analytics: dwell time, utilisation by hour, revenue per bay.

### 2.5 Operations and reliability

- PostgreSQL + migrations (Alembic).
- Device authentication for camera routes and heartbeat monitoring.
- Structured logging + metrics (Prometheus) + alerting.
- Containerised deployment (`docker compose`) with TLS termination.
- Automated backup of the SQLite/Postgres database.

---

## 3. Roadmap

### Before submission (days)

| Task | Effort | Blocks |
|---|---|---|
| Install `easyocr` + `ultralytics`, pin in requirements | 30 min | recognition claims |
| Run the 60-frame pilot measurement | 1 day | results chapter |
| Bench-test H1–H7 (servo, barrier, power) | 2 h | hardware chapter |
| Delete backups, untrack `node_modules`/`.next` | 1 h | clean handover |
| Correct the paper to 6 bays | 30 min | consistency |
| Rehearse the demo twice | 2 h | viva |

### Short term (weeks)

- Walk-in policy with reservation buffer.
- Device key + admin auth on control routes.
- Stuck-bay timeout flagging.

### Long term (semester / product)

- Multi-lot, PostgreSQL, payments, PWA, analytics, anti-spoofing.

---

## 4. How to phrase limitations in the viva

> "The main limitation is inherent to the design: because we infer occupancy from gate
> events, an unreadable exit plate can leave a bay marked occupied. We mitigate it with
> manual release and a full reset, both audited. The alternative — a sensor in every bay —
> removes that failure but reintroduces linear hardware cost, which is exactly what this
> project set out to avoid. So the limitation is a deliberate trade-off, not an
> oversight."

That answer demonstrates ownership. Do not apologise for the design; explain it.
