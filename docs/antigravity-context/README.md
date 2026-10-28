# Antigravity → OpenCode handoff context

This folder carries over the context from the Google **Antigravity** sessions in
which AutoPark was built. The code was never separate — Antigravity edited this
same directory — so what was actually missing was the **reasoning, decisions and
plans**, which live in Antigravity's local "brain".

## What's in here

| File | Origin | Purpose |
|---|---|---|
| `01-implementation-plan.md` | brain artifact | The 4-phase plan (barrier signal engine → driver portal → operator console → ESP32 firmware). All phases marked done. |
| `02-app-architecture-walkthrough.md` | brain artifact | Screen-by-screen product spec, personas, race-condition logic. |
| `03-district-design-system.md` | brain artifact | Token mapping for the *first* theme (purple "District by Zomato"). Superseded by the b/w direction — kept for the token vocabulary. |
| `04-logo-suggestions.md` | brain artifact | 8 monochrome logo concepts; the chosen one is implemented in `frontend/src/components/DistrictLogo.tsx`. |
| `05-conversation-timeline.md` | trajectory DB | All 25 user turns in order + standing decisions + where the session stopped. **Read this first.** |
| `06-conference-paper-draft.md` | brain artifact (other session) | 8-page IEEE-style paper draft for the final-year project. |
| `07-earlier-iteration/` | brain artifact (Sep session) | The **first** AutoPark build: buzzer instead of barrier, BookMyShow light theme, green RC car, no auth. This is what `backend_backup_*` folders contain. |
| `assets/` | brain artifact | The logo concept sheets referenced by `04-logo-suggestions.md`. |

## Where it came from

Antigravity stores conversations locally, per-project:

```
~/.gemini/antigravity-ide/
├── conversations/<conversation-id>.db          SQLite: steps (protobuf payloads)
└── brain/<conversation-id>/
    ├── *.md                                   the plans / walkthroughs the agent wrote
    └── .system_generated/logs/transcript.jsonl full chat: prompts + replies, timestamped
```

- Project conversation for this repo: `b64d1016-779e-4191-8722-890a2bdd2d21`
  (1,381 steps, 22→28 Oct 2026).
- Earlier AutoPark build: `3d96d371-51a1-4164-b307-8298576c66a4` (Sep 2026).
- Paper draft came from `48a03ac5-5a1d-4371-acbf-f1deb225ed08`.
- Workspace→conversation mapping is in
  `~/Library/Application Support/Antigravity IDE/User/workspaceStorage/*/workspace.json`.

## Re-extracting (if you need more)

One command handles the normal case — after an Antigravity run finishes:

```bash
python3 scripts/sync_from_antigravity.py check
```

It diffs the repo against the snapshot in `.antigravity-sync/`, appends new user
turns from the live conversation DB, copies any new brain artifacts, and writes a
timestamped report to `docs/antigravity-context/08-updates/`. (`snapshot` before,
`status` to peek.)

Raw access, if you want to dig by hand:

```bash
# list brain artifacts for every conversation
ls ~/.gemini/antigravity-ide/brain/*/*.md

# dump the user turns of a conversation
python3 - <<'EOF'
import sqlite3, re
p = "/Users/ujwalanand/.gemini/antigravity-ide/conversations/b64d1016-779e-4191-8722-890a2bdd2d21.db"
c = sqlite3.connect(f"file:{p}?mode=ro", uri=True)
for idx, payload in c.execute("select idx, step_payload from steps where step_type=14 order by idx"):
    print(f"\n--- idx={idx}")
    for m in re.finditer(rb'[\x09\x0a\x0d\x20-\x7e]{60,}', payload or b''):
        s = m.group().decode("ascii", "ignore").strip()
        if re.fullmatch(r'[A-Za-z0-9+/=_\-\.]{60,}', s):   # skip base64/ids
            continue
        print(s)
EOF
```

`step_type = 14` is the user-message step; `15` is the agent step; `8`/`98`/`99`
are tool plumbing.

## What does **not** transfer

- Antigravity's model, tool permissions and MCP servers (Chrome DevTools MCP was
  used to drive `localhost:3000`).
- **Antigravity's assistant replies are not in the conversation `.db`** — but they
  *are* on disk, in
  `brain/<id>/.system_generated/logs/transcript.jsonl` (one JSON object per step:
  `USER_INPUT`, `PLANNER_RESPONSE`, tool calls, with timestamps). The sync script
  reads that file by byte offset, so it captures prompts **and** replies.
- Browser screenshots/recordings in `brain/<id>/*.png|webp` — still on disk if
  you want them, just not copied here.
- Any server-side "knowledge" / memory. Only what is in the `.db` and `brain/`
  folders is portable.

## How OpenCode picks this up

`AGENTS.md` at the repo root is loaded automatically every session and points at
this folder. Nothing else is needed.
