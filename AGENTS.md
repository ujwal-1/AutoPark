# AutoPark — Agent Context

Camera-based smart parking system. Two ESP32-CAMs (entry + exit) replace per-bay
sensors: the entry camera reads a plate, matches it to a pre-check-in, assigns a
bay and lifts a servo boom barrier; the exit camera re-reads the plate, closes the
session, frees the bay and produces a receipt.

Full product reasoning, screen specs and history: `docs/antigravity-context/`
(start with `05-conversation-timeline.md`). The project was built in Google
Antigravity; that folder is the extracted handoff.

## Layout

```
backend/    FastAPI + SQLAlchemy/SQLite + YOLOv11 + EasyOCR   (port 8000)
frontend/   Next.js 14 App Router + Tailwind + lucide          (port 3000)
hardware/   entry_esp32cam.ino, exit_esp32cam.ino  (servo on GPIO 12, buzzer GPIO 13)
docs/       antigravity-context/ (plans, specs, paper draft)
```

Run: `./scripts/host.sh start` — starts backend + frontend **detached** (survives
closing the IDE/terminal), logs to `.run/`. Also `status | logs | stop`.
Backend entrypoint `backend/start_backend.py`; DB is `backend/autopark.db` (the
`autopark.db` in the repo root is stale — no `users` table, ignore it).
Backend deps live in `/opt/anaconda3/bin/python3`, not the default `python3`.

`backend_backup_optimized/` and `backend_backup_pre_optimization/` are frozen
copies. **Never edit them**; they exist only for rollback.

## Invariants (deliberate — don't undo without asking)

1. **Two cameras only.** No per-bay sensing. Occupancy is derived from entry/exit
   events, so every state transition must go through `slot_allocator.py`.
2. **Pre-check-in required.** `allocate_entry_slot()` denies plates with no unique
   `PENDING_ARRIVAL` booking (`unauthorized` / `ambiguous`) and keeps the barrier
   down. Walk-in entry was explicitly deferred, not forgotten.
3. **Boom barrier is the actuator**: response carries `open_barrier` /
   `barrier_action` (`OPEN` / `LOCKED`). `trigger_buzzer` is legacy compat only.
4. **6 bays**: `A1..A3` (Zone A), `B1..B3` (Zone B), defined in `app/config.py`.
   Adding bays means changing `settings.SLOTS` — migrations handle the rest.
5. **User-chosen bay must be honoured.** `/book` sends `slot_number`; the endpoint
   reserves that exact bay. Bug reports about "always books A1" were this.
6. **Visual language**: black & white, high-contrast, Plus Jakarta Sans, generous
   radii. User explicitly does not want a "vibe coded" / neon-gradient look.
   (The purple "District" theme in `03-district-design-system.md` was replaced.)

## Allocation rules (backend/app/slot_allocator.py)

confidence ≥ 0.75 → plate ≥ 4 alnum chars → no duplicate active session →
10 s per-plate cooldown → fuzzy match (Levenshtein) against pending bookings →
first `AVAILABLE` bay by name. Entry writes `ParkingSession` + `DetectionEvent`,
flips bay to `ALLOCATED`, booking to `CHECKED_IN`. Exit matches the active session
by plate (fuzzy), sets `COMPLETED`, frees the bay.

## Syncing changes from Antigravity

Antigravity and OpenCode edit the **same folder**, so code changes appear here
immediately — but only after Antigravity's run finishes, and only if nothing is
mid-write. To capture what changed and the reasoning behind it:

```bash
python3 scripts/sync_from_antigravity.py snapshot   # BEFORE Antigravity works
python3 scripts/sync_from_antigravity.py check      # AFTER it finishes
python3 scripts/sync_from_antigravity.py status     # peek, writes nothing
```

`check` writes `docs/antigravity-context/08-updates/<timestamp>.md` containing:

- every new user request from the Antigravity conversation, verbatim
- added / modified / deleted files, by sha256 against the snapshot
- any new plan/walkthrough markdown the agent produced
- a condensed log of the actions it took

Then re-read `08-updates/` before making further edits.

## Notes / known gaps

- `requirements.txt` is missing **`ultralytics`** and **`easyocr`**; a clean
  install will fail without them.
- Hardware is verified only via `DemoControls` / `/api/parking/simulate/*`; the
  simulator is part of the viva demo, keep it working.
- `frontend/src/lib/config.ts` derives API host from `window.location.hostname`;
  CORS is `*` with credentials.
- The paper draft (`docs/antigravity-context/06-conference-paper-draft.md`) claims
  8 bays and specific accuracy/latency figures that no longer match the code —
  treat the code as truth and reconcile before submitting.
