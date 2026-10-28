# 08 — Testing and Validation

> All results below were produced on **28 October 2026** against an isolated backend
> instance on a throwaway database. The live demo database was not modified.

---

## 1. Test strategy

| Level | What it proves | How it is run |
|---|---|---|
| **Unit / logic** | allocation, matching, billing rules | Python calls on allocator/pipeline functions |
| **Integration** | API + database + allocator together | `scripts/verify_system.sh` (isolated DB) |
| **System / functional** | booking → entry → exit → receipt end to end | scripted HTTP calls |
| **UI** | pages render, states handled, realtime updates | browser checks |
| **Hardware-in-the-loop** | firmware + servo respond to backend contract | bench test with camera/servo |
| **Acceptance** | the demo script succeeds | dry run before the demo |

The automated suite is committed as **`scripts/verify_system.sh`**. It starts its own
backend on port 8010/8011/8012 with `DATABASE_URL` pointing at `/tmp`, so it can be run
during development without disturbing the demonstration data.

---

## 2. Environment

| Item | Value |
|---|---|
| OS | macOS (Darwin) |
| Python | `/opt/anaconda3/bin/python3` (backend dependencies installed here only) |
| Backend | Uvicorn, isolated port 8012 |
| Database | temporary SQLite file, created and deleted by the script |
| Frontend | Next.js dev server on 3000 (manual UI checks only) |
| Models | YOLO plate weights loaded; EasyOCR **not installed** in this environment |

> Because EasyOCR is absent, the automated suite exercises the **decision, allocation,
> billing and refusal logic** through the direct plate endpoint, not the OCR itself.
> OCR accuracy is a separate measurement; the protocol is in Section 6.9.

---

## 3. Automated system tests (executed)

Command:

```bash
./scripts/verify_system.sh 8012
```

Result:

```
==================== RESULTS ====================
PASS  T1 book requested bay  (B3)
PASS  T2 entry status  (allocated)
PASS  T2 entry bay  (B3)
PASS  T2 barrier open flag  (True)
PASS  T3 duplicate entry  (already_allocated)
PASS  T4 exit status  (released)
PASS  T4 released bay  (B3)
PASS  T4 amount (<=60m)  (30)
PASS  T5 cancel frees bay  (AVAILABLE)
PASS  T6 unauthorized status  (unauthorized)
PASS  T6 barrier stays shut  (False)
PASS  T7 ambiguous refused  (ambiguous)
PASS  T7 no barrier open  (False)
PASS  T8 duration ~61m  (61)
PASS  T8 amount (61m)  (50)
-------------------------------------------------
PASS=15  FAIL=0
```

### Test case detail

| ID | Scenario | Action | Expected | Actual | Verdict |
|---|---|---|---|---|---|
| T1 | Driver books a specific bay | pre-check-in `B3` | `slot_number = B3` | B3 | ✅ |
| T2 | Arrival allocates the booked bay | entry for `KA05KK0403` | `allocated`, slot B3, barrier true | allocated / B3 / True | ✅ |
| T3 | Duplicate frame does not double-allocate | repeat entry | `already_allocated` | already_allocated | ✅ |
| T4 | Exit releases the bay and bills hour 1 | exit | `released`, B3, ₹30 | released / B3 / 30 | ✅ |
| T5 | Cancelling a booking frees the bay | book A2 → cancel | A2 `AVAILABLE` | AVAILABLE | ✅ |
| T6 | Unregistered plate is refused | entry `UNAUTH999` | `unauthorized`, barrier false | unauthorized / False | ✅ |
| T7 | Two similar bookings are ambiguous | bookings …0403 & …0404, read …0405 | `ambiguous`, barrier false | ambiguous / False | ✅ |
| T8 | Second hour block is billed | 61-minute stay | 61 min, ₹50 | 61 / 50 | ✅ |

T7 is the important one: it proves the system **refuses to guess** when a reading sits
between two registrations. T2 proves the bay chosen at booking time is the bay actually
allocated — the regression that motivated the test.

---

## 4. Manual / UI checks

| ID | Check | Method | Result |
|---|---|---|---|
| U1 | All routes reachable | `GET /`, `/book`, `/pass`, `/operator`, `/history`, `/login`, `/register` | 200 |
| U2 | Receipts list renders with real data | signed-in account with completed sessions | ✅ |
| U3 | Receipt modal opens | click `View Invoice` | ✅ |
| U4 | In-progress session is not shown as a paid receipt | active session, open modal | ✅ labelled "Session In Progress", estimated fee |
| U5 | Receipts page handles empty history | account with no sessions | ✅ "No Past Parking Records" |
| U6 | Receipts page no longer crashes | reload with data | ✅ no `sessions.filter` error |
| U7 | Operator diagnostics request | `/api/anpr/diagnostics` | 200 |
| U8 | Operator reset path | `/api/parking/reset` (POST) | route exists (405 on GET as expected) |

> U7/U8 were endpoint mismatches found during documentation: the console called
> `/api/detection/diagnostics` and `/api/parking/simulate/reset`, both of which return
> 404. They were corrected to `/api/anpr/diagnostics` and `/api/parking/reset`.

---

## 5. Hardware-in-the-loop checks

| ID | Check | Pass criterion | Status |
|---|---|---|---|
| H1 | Servo sweeps 0° → 90° → 0° | smooth, no stall | bench test required |
| H2 | Barrier opens on authorised entry | arm lifts within ~1 s of response | bench test required |
| H3 | Barrier stays closed for unauthorised entry | no movement | bench test required |
| H4 | Exit barrier opens only on `released` | no movement otherwise | bench test required |
| H5 | Servo returns to 0° after 5 s | arm down | bench test required |
| H6 | Wi-Fi reconnect after router restart | capture resumes | bench test required |
| H7 | 5 V rail holds under servo load | no brown-out | bench test required |

These are marked as **bench tests** rather than claimed. Run them before the viva and
record the date and outcome in the report; examiners accept "we tested H1–H5 on
<date>" far more readily than an untested assertion.

---

## 6. Defect log

| ID | Defect | Impact | Root cause | Status |
|---|---|---|---|---|
| D-01 | Booked bay not honoured at entry | driver sent to wrong bay | allocator ignored `pending_booking.slot_id` | **Fixed** — verified by T2 |
| D-02 | Changing/cancelling a booking left the old bay reserved | phantom occupancy | bay released only on some paths | **Fixed** — verified by T5 |
| D-03 | Receipts page crashed | entire page unusable | API returns `{history:[…]}`, page assumed an array | **Fixed** — verified by U2/U6 |
| D-04 | Operator console diagnostics 404 | diagnostics panel empty | wrong path (`/api/detection/diagnostics`) | **Fixed** |
| D-05 | Operator reset 404 | reset button did nothing | wrong path (`/api/parking/simulate/reset`) | **Fixed** |
| D-06 | Active session shown as a paid exit receipt | misleading billing | modal assumed every row was completed | **Fixed** — U4 |
| D-07 | `easyocr` not installed / not in requirements | live ANPR degraded on this machine | environment + packaging gap | **Open** |
| D-08 | `ultralytics` not in requirements | clean install cannot run detector | packaging gap | **Open** |
| D-09 | Root `autopark.db` stale (no `users`) | auth fails if pointed at it | leftover file | **Open** — documented, ignore file |
| D-10 | Hardcoded default JWT secret | token forgery if deployed as-is | configuration default | **Open** — set `JWT_SECRET` |
| D-11 | `node_modules` / `.next` tracked in git | 13,612 junk files, ~600 MB | repository hygiene | **Open** |

A defect table is a strength, not an admission: it shows that the team tested, found
real defects, fixed them, and knows what remains.

---

## 7. Regression checklist (run before every submission/demo)

```bash
# 1. Services
./scripts/host.sh status
curl -s http://localhost:8000/health | python3 -m json.tool
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/

# 2. Logic suite (isolated DB, safe)
./scripts/verify_system.sh 8012

# 3. Clean demo state
curl -s -X POST http://localhost:8000/api/parking/reset

# 4. Confirm six bays available
curl -s http://localhost:8000/api/parking/summary | python3 -m json.tool
```

Expected: `PASS=15 FAIL=0`, `slots_total: 6`, `available: 6`, `active_sessions: 0`.

---

## 8. Traceability: objectives → evidence

| Objective | Evidence |
|---|---|
| O1 plate detection & reading | ANPR pipeline implemented; per-stage diagnostics endpoint (`/api/anpr/diagnostics`) |
| O2 pre-registered access only | T6 (unauthorized), T7 (ambiguous) |
| O3 chosen bay honoured | T1 + T2 |
| O4 occupancy from gate events | T4, T5, layout/summary checks |
| O5 automatic barrier | T2/T4 `open_barrier` flags; H1–H5 pending bench run |
| O6 realtime visibility | WebSocket events observed by UI; U1–U6 |
| O7 auditable billing | T4, T8; receipts U2–U5 |
| O8 demonstration without hardware | simulation endpoints used throughout T2–T8 |

---

## 9. What is still unmeasured

Be explicit in the report:

1. **Plate recognition accuracy** on a labelled frame set (needs EasyOCR installed).
2. **End-to-end latency distribution** (needs timestamps around the camera POST).
3. **False-admit / false-reject rates** under controlled conditions.
4. **Barrier actuation time** from response to arm movement.
5. **Long-run stability** (hours of continuous capture).

Section 6.9 gives the protocol for each. Do not put numbers in the
results chapter that were not produced by that protocol.
