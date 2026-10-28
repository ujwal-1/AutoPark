# Antigravity Session Timeline — AutoPark

Recovered from the Antigravity trajectory DB
(`~/.gemini/antigravity-ide/conversations/b64d1016-779e-4191-8722-890a2bdd2d21.db`,
1,381 steps, 25 user turns). Prompts are verbatim (typos preserved) with a short
note on what each one changed in the codebase.

Session span: **22 Oct 2026 → 28 Oct 2026**.

| # | User request (verbatim) | What it produced |
|---|---|---|
| 1 | "accesss my folder, and then show me the front end and also tell me exactly about the current working and the status of my app" | Baseline audit of the dashboard; first screenshots of `localhost:3000`. |
| 2 | "what is this simulation? part?" | Explained the HIL/demo simulator on the operator console. |
| 3 | "for the final year project, is this necessary is it professional?" | Design critique of the demo controls. |
| 4 | Long context dump: 2× ESP32-CAM, entry assigns slot, exit identifies same car and releases slot, **no per-bay sensors**, app shows live availability, advance booking, and **walk-in entries must also get a slot with no conflict against bookings** | This is the **canonical product statement**. Everything after is measured against it. |
| 5 | "give me a very solid app implementation, walk me through the complete plan ... every page" | → `02-app-architecture-walkthrough.md` |
| 6 | "make a complete implementation plan for yourself ... and show me the plan" | → `01-implementation-plan.md` |
| 7 | "for now we will remove the manual entry part and later we will look into it, cancel the manual entry for now" | **Decision: walk-in / manual entry deferred.** Entry requires a pre-check-in. |
| 8 | "instead of buzzer we will have a boom, where by using servo motor we will use a boom at entrance and exit" | **Decision: SG90 servo boom barriers** replace the buzzer as the primary actuator (buzzer kept for backward compat). |
| 9 | "should we make a app? like login or register page and then moving to next page ... production level, give me just the plan" | Multi-page auth-gated app: `/login`, `/register`, `/book`, `/pass`, `/history`, `/operator`. |
| 10 | "follow the plan ... suppose this has to be launched as an app in a country, how would it be expected to be built and to be looked" | Production-grade UX pass, JWT auth, sessions, receipts. |
| 11 | "continue from where left" | — |
| 12 | "the complete theme of the app ... I need it in like district app, the design should exactly be like district app" | → `03-district-design-system.md` (District-by-Zomato theme, purple/magenta). |
| 13 | "continue from where left" | — |
| 14 | "can we change colour to black and white like this ... i dont want it to look like vibe coded" | **Decision: monochrome (black/white) redesign** supersedes the purple District theme. |
| 15 | "remove ai dual camera and servo boom text, and remove the 'in the mood for' text / remove the sector 62 / is the 4th pic necessary?" | Copy cleanup on landing page. |
| 16 | "continue from left" | — |
| 17 | "what are all required here and what are all not required in this column" | Operator console column audit. |
| 18 | "remove these texts" | Copy cleanup. |
| 19 | "do u have any other logo suggestions?" | → `04-logo-suggestions.md` |
| 20 | "use this one / remove 2nd img text / remove 3rd pic text" | Logo picked; `/logos` showcase page. |
| 21 | **"if im trying to click on any a2 or a3 or bay b slots and book, it will still book a1 only. In active pass i need the exact slot which i have booked or assigned displayed properly"** | Bug #1 — bay selection ignored. |
| 22 | "continue from where left" | — |
| 23 | "host the website now" | Deployment attempt. |
| 24 | **"so there is a bug, if i book any bay a2 or a3, still only a1 will be booked, so solve this bug"** | Bug #1 re-report. Fixed by adding `slot_number` to `PreCheckinRequest` + `selectedSlot` in `/book`. |
| 25 | (final steps — visual verification) | Screenshots of cleaned home/footer. |

## Standing decisions (do not silently reverse these)

1. **No per-bay sensors.** Exactly two cameras: entry + exit. Occupancy is inferred from entry/exit events only.
2. **Pre-check-in is mandatory** for authorized entry; unregistered plates are denied (`unauthorized`) and the barrier stays down. Walk-in support is *parked* — to be revisited.
3. **Boom barriers, not buzzers.** Servo on GPIO 12, 0° = closed, 90° = open. Buzzer on GPIO 13 is legacy/optional.
4. **6 bays**: Zone A executive `A1–A3`, Zone B premium `B1–B3`. (Newer paper draft mentions 8 bays / A1–A4, B1–B4 — conflicts with code; code is the source of truth.)
5. **Visual language**: black & white, high-contrast Swiss/editorial, Plus Jakarta Sans. Explicitly *not* "vibe coded" looking, no neon gradients.
6. **Two personas**: Driver portal (`/`, `/book`, `/pass`, `/history`) and Operator console (`/operator`, HIL simulator).
7. **Arbitrary bay selection is supported** — a booking must honour the chosen bay, and `/pass` must display the exact bay.

## Where the session left off

- Both bay-selection bugs were fixed (`slot_number` flows `/book` → `/api/bookings/pre-checkin` → `PreRegistration.slot_id`).
- `Host the website now` was the last unfinished thread — the app still only runs locally on ports 8000/3000.
- Conference paper draft (`06-conference-paper-draft.md`) was written in a **separate** Antigravity conversation and its numbers (8 bays, 96.4% precision, 184 ms latency) do not match the 6-bay code yet.
