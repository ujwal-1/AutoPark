# 06 — Frontend Design

> Root: `frontend/src/` · framework: Next.js 14 App Router · port **3000**

---

## 1. Purpose of the frontend

The web client is not a dashboard bolted onto an API. It is the **driver's interface to
the gate** and the **operator's window into the lot**:

- a driver needs to reserve a bay, know exactly where to go, and get a receipt;
- an operator needs to see the lot, the cameras, the last decisions, and to intervene;
- an examiner needs to see failure behaviour, not just a happy path.

Everything is rendered from backend state. The client never computes occupancy.

---

## 2. Route map

| Route | Audience | Purpose |
|---|---|---|
| `/` | All | Live Deck: availability, bay cards, quick actions, activity log |
| `/book` | Driver | Choose a bay, plate and duration, create or update a booking |
| `/pass` | Driver | Active pass: assigned bay, session status, exit receipt |
| `/history` | Driver | Completed sessions, totals, itemised receipts |
| `/operator` | Operator | Digital twin, camera status, diagnostics, HIL controls |
| `/login` | Driver | Sign in |
| `/register` | Driver | Create account |
| `/logos` | Internal | Logo/brand exploration page (not part of the demo flow) |

Navigation (`Navbar.tsx`): **Live Deck · Pre-Book · Active Pass · Receipts**. The
operator console is reachable directly at `/operator`.

---

## 3. Page behaviour

### 3.1 Live Deck (`/`)

- Availability counter (`x / 6`) and per-zone filter (All / Zone A / Zone B).
- Search by bay, plate or zone.
- Bay cards show status, zone, plate (if occupied), rate, and one primary action:
  `Pre-Book Bay` or `View Active Pass`.
- Activity log streams WebSocket events.
- Unauthorised-entry banner appears on refusal events.

**Design intent:** a driver should answer "is there space, and where?" in under five
seconds, on a phone, without scrolling horizontally.

### 3.2 Pre-Book (`/book`)

- Reads `?slot=` from the query string so "Pre-Book Bay" on a card pre-selects that bay.
- Collects plate, vehicle type and duration.
- Sends `slot_number` in the pre-check-in payload, so the chosen bay is the one bound in
  the database.
- Handles three states honestly:
  - success → confirmation with bay number;
  - bay taken → inline error, other bays remain selectable;
  - already parked → explicit message naming the existing vehicle and bay.

### 3.3 Active Pass (`/pass`)

- Shows the active booking and/or active session.
- Displays `BAY <slot_number>` prominently — this is the payoff of the booking flow.
- On exit, renders the itemised receipt modal.
- Degrades to a clear "no active pass" state when nothing is booked.

### 3.4 Receipts (`/history`)

- Lists the last 20 sessions for the signed-in account.
- Aggregate metrics: total sessions, total **paid** amount (completed only), compliance.
- Search across plate, bay and status.
- `View Invoice` opens the receipt modal.
- **In-progress sessions are labelled as such** and show elapsed time plus an estimated
  fee — not a fabricated exit timestamp.

> This page was the site of a real defect: the API returns `{ "history": [...] }` and the
> page treated the response as a bare array, crashing with
> `sessions.filter is not a function`. Fixed by unwrapping the response, adding an error
> state, and separating completed from active sessions. It is a good example to mention
> under "defects found and fixed during validation".

### 3.5 Operator Console (`/operator`)

A single screen for staff and for the demo:

| Region | Content |
|---|---|
| Digital twin | 2D floorplan of all six bays, colour-coded by status |
| Camera monitors | Entry and exit stream status, last plate, last decision |
| Barrier indicators | Inferred state (LOCKED / OPEN) from backend events |
| Diagnostics drawer | Quality grade, candidate list, failure stage, timing |
| HIL controls | Simulate authorised entry, unauthorised entry, exit, manual release, reset |

**Honesty point:** the barrier indicator is inferred from the API response. There is no
position wire from the servo. Say "commanded open", not "measured open".

### 3.6 Auth pages (`/login`, `/register`)

- JWT stored in `localStorage` under `autopark_token`.
- On `401`, the token is removed and the user is treated as signed out.
- No refresh token; expiry is 24 h.

---

## 4. Design system

The UI uses a **high-contrast monochrome operations language**: near-black surfaces,
thin white borders, one white primary action per view, and state colour reserved for
meaning (green = available, amber = reserved, red = refusal).

### Core tokens (`tailwind.config.js`)

| Token | Value | Use |
|---|---|---|
| `districtBg` | `#09090B` | page background |
| `districtBgElevated` | `#121215` | modal / elevated surface |
| `districtCard` | `#141416` | cards |
| `districtCardHover` | `#1A1A1E` | hover |
| `districtBorder` | `#27272A` | dividers |
| `districtInput` | `#18181B` | inputs |
| `districtMuted` | `#A1A1AA` | secondary text |
| `districtSubtext` | `#71717A` | tertiary text |
| `districtWhite` | `#FFFFFF` | primary text / primary button |

Shape and depth:

- `districtCard` shadow: `0 4px 24px -2px rgba(0,0,0,.7)` + 1 px white inner ring.
- Pills and rounded-2xl/3xl corners; no gradients on surfaces.
- Type: heavy weights for headings (`font-black`), monospace for plates, bays and money.

### Why this works in a viva

- It photographs well on a projector — high contrast survives bad projectors.
- It reads as infrastructure software rather than a student template.
- Status is communicated by **label + colour**, so it still works for colour-blind
  viewers and in black-and-white printouts.

> **Framing caution:** the brand mark reads `districtPARK` and the token names are
> `district*`. In the report, describe the style as a "monochrome operations design
> language"; do not claim the visual identity as an original creation, and do not present
> it as an official District product.

---

## 5. Component inventory

| Component | Role |
|---|---|
| `Navbar` | Primary navigation, active-route state |
| `DistrictLogo` | Wordmark + barrier glyph |
| `StatsOverview` | Availability / occupancy metric cards |
| `ParkingLayout` | Bay grid and floorplan |
| `LiveActivityLog` | Event stream from WebSocket |
| `LiveCameraFeed` | Camera status and last frame/detection |
| `NotificationBanner` | Authorised / refused / full alerts |
| `UserPreCheckinPanel` | Booking form and booking status |
| `DemoControls` | HIL simulator buttons |
| `ExitReceiptModal` | Itemised receipt, active or completed |
| `Header` | Page-level heading block |

---

## 6. Realtime behaviour

```
connect ws://<api>/ws/parking
  on message → switch(type)
    slot.allocated / slot.released → update bay + summary
    booking.created / cancelled   → update pass + availability
    vehicle.* / barrier.*         → update activity log + indicators
    entry.unauthorized            → show alert banner
  on close → exponential reconnect, refetch REST snapshot
```

Why a snapshot refetch on reconnect: WebSocket messages are not replayed. After any
disconnect, the client cannot assume it saw every transition, so it re-reads
`/api/parking/layout` and `/api/parking/summary` and then resumes streaming. This is a
small detail that prevents a stale dashboard — worth mentioning if asked about
reliability.

---

## 7. UX states

Every data view implements four states:

| State | Treatment |
|---|---|
| Loading | spinner + explicit label ("Loading session receipts…") |
| Empty | explanation + next action ("Pre-Book Your First Slot") |
| Error | cause + **Try Again** (added to Receipts during validation) |
| Populated | data with status labels and actions |

The distinction between *empty* and *error* matters: an empty state that hides a failure
is a lie. This was fixed on the Receipts page and should be the pattern everywhere.

---

## 8. Responsiveness and accessibility

- Layout switches from two-column bay grid to single column below `sm`.
- Touch targets on primary actions are full-width and ≥ 44 px high.
- Contrast: white on `#09090B` is ~19:1; muted text on cards is ~5:1.
- Plates, bay IDs and money use monospace so digits align and remain legible in
  screenshots.
- Status is never communicated by colour alone.

Known gaps (state them, do not hide them):

- No explicit ARIA live region for WebSocket updates.
- No keyboard trap management in the receipt modal.
- No dark/light toggle — the product is intentionally dark-only.

---

## 9. Frontend \u2194 backend contract notes

- Base URL from `lib/config.ts` (`getApiBaseUrl()`), not hard-coded in pages.
- `my-history` returns an **object** (`{history: [...]}`); other booking endpoints return
  objects too. Parse defensively; do not assume arrays.
- Receipt fields come from the **exit response** on the pass page and are recomputed on
  the history page from `entry_time`/`exit_time`. The backend is authoritative.
- The Live Deck treats `ALLOCATED` (booked, not arrived) and `OCCUPIED` (inside) as
  different states; the copy reflects that ("Reserved" vs "Occupied").

---

## 10. What to show in the report

Recommended screenshots (capture at 1440 px wide, dark UI, real data):

1. Live Deck with mixed availability.
2. Pre-Book with a bay pre-selected from a card.
3. Active Pass showing `BAY A2`.
4. Receipts list with completed sessions.
5. Receipt modal (completed).
6. Operator console with the diagnostics drawer open.
7. Unauthorised entry banner.

Each screenshot should have a caption that states **what decision it proves**, not just
what it shows. Example: *"Figure 6.3 — Active Pass after entry. The bay displayed is the
bay selected at booking time, confirming end-to-end slot binding."*
