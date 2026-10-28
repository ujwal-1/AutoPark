#!/usr/bin/env python3
"""
Sync context from Google Antigravity into this repo.

Antigravity keeps its state locally:
    ~/.gemini/antigravity-ide/conversations/<id>.db   trajectory (SQLite: steps + prompts)
    ~/.gemini/antigravity-ide/brain/<id>/*.md         plans/walkthroughs the agent wrote
    ~/Library/Application Support/Antigravity IDE/User/workspaceStorage/*/workspace.json

This script does three things:
  1. `snapshot`  - record the current state of every source file (sha256) + the
                   conversation watermark. Run this BEFORE Antigravity starts working.
  2. `check`     - diff the working tree against that snapshot, pull every new
                   conversation step, and copy new brain artifacts into
                   docs/antigravity-context/08-updates/.
  3. `status`    - quick look at what changed, without writing anything.

Usage:
    python3 scripts/sync_from_antigravity.py snapshot
    python3 scripts/sync_from_antigravity.py check      [--rebaseline]
    python3 scripts/sync_from_antigravity.py status

Stdlib only. Safe to run while Antigravity/Next/FastAPI are running: the
conversation DB is copied (db + -wal + -shm) before being read.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sqlite3
import tempfile
import time
from datetime import datetime
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
STATE_DIR = REPO / ".antigravity-sync"
BASELINE = STATE_DIR / "baseline.json"
STATE = STATE_DIR / "state.json"
UPDATES_DIR = REPO / "docs" / "antigravity-context" / "08-updates"

BRAIN = Path.home() / ".gemini" / "antigravity-ide" / "brain"
CONVERSATIONS = Path.home() / ".gemini" / "antigravity-ide" / "conversations"

SKIP_DIRS = {
    ".git", "node_modules", ".next", "__pycache__", ".pytest_cache",
    ".mypy_cache", "venv", ".venv", "env", "dist", "build", ".antigravity-sync",
    "__MACOSX", ".idea", ".vscode", "debug_captures",
}
SKIP_SUFFIX = {".pyc", ".pyo", ".log", ".DS_Store", ".pack", ".pack.gz", ".tsbuildinfo"}
SKIP_NAMES = {".DS_Store"}

USER_STEP = 14          # step_type that carries a user message
ACTION_STEPS = {15, 101, 8, 132}   # tool calls / shell / task results


# ---------------------------------------------------------------- file snapshot

def iter_files(root: Path):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            if name in SKIP_NAMES:
                continue
            p = Path(dirpath) / name
            if p.suffix in SKIP_SUFFIX:
                continue
            # skip giant model weights: they never change and cost seconds to hash
            if p.suffix == ".pt" or (p.suffix == ".db" and p.stat().st_size > 20_000_000):
                continue
            yield p


def hash_file(p: Path) -> dict:
    h = hashlib.sha256()
    with p.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    st = p.stat()
    return {"sha": h.hexdigest(), "size": st.st_size, "mtime": int(st.st_mtime)}


def snapshot_tree() -> dict:
    files = {}
    for p in iter_files(REPO):
        try:
            files[str(p.relative_to(REPO))] = hash_file(p)
        except OSError:
            pass
    return files


# ------------------------------------------------------------ conversation DB

def pick_conversation() -> Path | None:
    """Newest conversation DB that mentions this workspace."""
    if not CONVERSATIONS.exists():
        return None
    marker = str(REPO).encode()
    candidates = sorted(CONVERSATIONS.glob("*.db"), key=lambda p: p.stat().st_mtime, reverse=True)
    for db in candidates:
        try:
            with temp_read(db) as conn:
                hit = False
                for (payload,) in conn.execute(
                    "select step_payload from steps order by idx desc limit 400"
                ):
                    if payload and marker in payload:
                        hit = True
                        break
                if hit:
                    return db
        except Exception:
            continue
    return candidates[0] if candidates else None


class temp_read:
    """Read a live WAL SQLite DB without touching the original."""

    def __init__(self, db: Path):
        self.db = db
        self.tmp = None

    def __enter__(self):
        self.tmp = tempfile.mkdtemp(prefix="ag-sync-")
        dst = Path(self.tmp) / self.db.name
        shutil.copy2(self.db, dst)
        for suffix in ("-wal", "-shm"):
            side = Path(str(self.db) + suffix)
            if side.exists():
                shutil.copy2(side, Path(str(dst) + suffix))
        self.conn = sqlite3.connect(f"file:{dst}?mode=ro", uri=True)
        return self.conn

    def __exit__(self, *exc):
        try:
            self.conn.close()
        except Exception:
            pass
        if self.tmp:
            shutil.rmtree(self.tmp, ignore_errors=True)
        return False


UUID_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
B64_RE = re.compile(r"[A-Za-z0-9+/=_\-\.$%]{60,}")
PRINTABLE_RE = re.compile(rb"[\x09\x0a\x0d\x20-\x7e]{40,}")


def clean_runs(data: bytes, min_words: int = 6) -> list[str]:
    out, seen = [], set()
    for m in PRINTABLE_RE.finditer(data or b""):
        s = m.group().decode("ascii", "ignore").strip()
        s = UUID_RE.sub("", s).strip()
        if not s or B64_RE.fullmatch(s):
            continue
        if "file:///" in s or "execute_url(" in s:
            continue
        if len(s.split()) < min_words:
            continue
        if s in seen:
            continue
        seen.add(s)
        out.append(s)
    return out


def extract_turns(conn, after_idx: int = -1) -> tuple[list[tuple[int, str]], int]:
    """Return ([(idx, prompt)], max_idx) for user messages newer than after_idx."""
    max_idx = conn.execute("select coalesce(max(idx), -1) from steps").fetchone()[0]
    turns = []
    for idx, payload in conn.execute(
        "select idx, step_payload from steps where step_type=? and idx>? order by idx",
        (USER_STEP, after_idx),
    ):
        runs = [r for r in clean_runs(payload) if len(r.split()) >= 3]
        if not runs:
            continue
        # Antigravity stores the prompt twice (raw + quoted) - keep the longest.
        prompt = max(runs, key=len).strip().strip('"')
        turns.append((idx, prompt))
    return turns, max_idx


def extract_actions(conn, after_idx: int, limit: int = 400) -> list[str]:
    """Condense tool calls into readable 'what happened' lines."""
    lines, seen = [], set()
    for idx, step_type, payload in conn.execute(
        "select idx, step_type, step_payload from steps where step_type in (15,101) and idx>? order by idx",
        (after_idx,),
    ):
        if not payload:
            continue
        for blob in re.finditer(rb"\{[^{}]{0,2000}\}", payload):
            try:
                obj = json.loads(blob.group().decode("utf-8", "ignore"))
            except Exception:
                continue
            label = obj.get("toolAction") or obj.get("CommandLine") or obj.get("toolSummary")
            target = obj.get("AbsolutePath") or obj.get("TargetFile") or obj.get("DirectoryPath") or obj.get("Cwd")
            if not label:
                continue
            line = f"- {str(label).strip()}"
            if target and str(target) not in line:
                line += f"  `{target}`"
            if line in seen:
                continue
            seen.add(line)
            lines.append(line)
            if len(lines) >= limit:
                return lines
    return lines


# ----------------------------------------------------------------- brain files

def brain_artifacts(conv_id: str | None) -> list[Path]:
    if not conv_id:
        return []
    root = BRAIN / conv_id
    if not root.exists():
        return []
    return sorted(root.glob("*.md"))


def transcript_path(conv_id: str | None) -> Path | None:
    """Antigravity's own JSONL log: user prompts *and* assistant replies."""
    if not conv_id:
        return None
    p = BRAIN / conv_id / ".system_generated" / "logs" / "transcript.jsonl"
    return p if p.exists() else None


def read_transcript(conv_id: str | None, offset: int) -> tuple[list[dict], int]:
    """Read complete JSONL lines past `offset`. Returns (entries, new_offset)."""
    p = transcript_path(conv_id)
    if not p:
        return [], offset
    size = p.stat().st_size
    if offset > size:          # log rotated/truncated
        offset = 0
    entries = []
    with p.open("rb") as fh:
        fh.seek(offset)
        for raw in fh:
            if not raw.endswith(b"\n"):    # partial write - pick it up next run
                break
            offset += len(raw)
            try:
                entries.append(json.loads(raw))
            except Exception:
                continue
    return entries, offset


def clean_user_input(text: str) -> str:
    text = re.sub(r"</?USER_REQUEST>", "", text)
    text = re.split(r"<ADDITIONAL_METADATA>|<USER_SETTINGS_CHANGE>", text)[0]
    return text.strip()


def chat_pairs(entries: list[dict], per_msg: int = 1400) -> tuple[list[str], list[str]]:
    """Split transcript entries into (user prompts, assistant replies)."""
    users, replies = [], []
    for e in entries:
        kind, content = e.get("type"), (e.get("content") or "").strip()
        if not content:
            continue
        if kind == "USER_INPUT":
            text = clean_user_input(content)
            if text:
                users.append(text)
        elif kind == "PLANNER_RESPONSE":
            # drop bare file links and thinking noise, keep the narrative
            body = "\n".join(l for l in content.splitlines() if not l.startswith("![") or len(l) > 0)
            if len(body) > per_msg:
                body = body[:per_msg].rstrip() + "\n\n_(truncated — full text in transcript.jsonl)_"
            replies.append(body)
    return users, replies


# --------------------------------------------------------------------- helpers

def load_json(p: Path, default):
    if not p.exists():
        return default
    try:
        return json.loads(p.read_text())
    except Exception:
        return default


def save_json(p: Path, data):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, indent=1))


def rel(p: Path) -> str:
    try:
        return str(p.relative_to(REPO))
    except ValueError:
        return str(p)


# -------------------------------------------------------------------- commands

def cmd_snapshot():
    conv = pick_conversation()
    conv_id = conv.stem if conv else None
    max_idx = -1
    if conv:
        with temp_read(conv) as c:
            max_idx = c.execute("select coalesce(max(idx), -1) from steps").fetchone()[0]
            steps = c.execute("select count(*) from steps").fetchone()[0]
        print(f"conversation: {conv.name}  ({steps} steps, max idx {max_idx})")
    else:
        print("conversation: none found")

    files = snapshot_tree()
    save_json(BASELINE, {
        "created": datetime.now().isoformat(timespec="seconds"),
        "conversation": conv_id,
        "files": files,
    })
    tp = transcript_path(conv_id)
    # do not re-report the history we have already documented
    save_json(STATE, {
        "conversation": conv_id,
        "last_idx": max_idx,
        "known_artifacts": [p.name for p in brain_artifacts(conv_id)],
        "transcript_offset": tp.stat().st_size if tp else 0,
    })
    print(f"snapshot: {len(files)} files hashed -> {rel(BASELINE)}")
    print("Now start working in Antigravity. When it finishes, run: check")


def diff_against_baseline():
    base = load_json(BASELINE, None)
    if not base:
        raise SystemExit("No snapshot yet. Run: python3 scripts/sync_from_antigravity.py snapshot")
    old = base["files"]
    new = snapshot_tree()

    added = sorted(set(new) - set(old))
    deleted = sorted(set(old) - set(new))
    modified = sorted(k for k in set(old) & set(new) if old[k]["sha"] != new[k]["sha"])
    return added, modified, deleted, base


def cmd_status():
    added, modified, deleted, base = diff_against_baseline()
    conv = pick_conversation()
    print(f"baseline taken {base['created']}")
    print(f"files: +{len(added)}  ~{len(modified)}  -{len(deleted)}")
    for k in added[:40]:
        print("  +", k)
    for k in modified[:80]:
        print("  ~", k)
    for k in deleted[:40]:
        print("  -", k)
    if conv:
        with temp_read(conv) as c:
            turns, max_idx = extract_turns(c, load_json(STATE, {}).get("last_idx", -1))
        print(f"\nnew user turns in Antigravity: {len(turns)} (db idx -> {max_idx})")
        for idx, prompt in turns:
            print(f"  [{idx}] {prompt[:140]}")


def cmd_check(rebaseline: bool = False):
    added, modified, deleted, base = diff_against_baseline()
    state = load_json(STATE, {"last_idx": -1, "conversation": None,
                              "known_artifacts": [], "transcript_offset": 0})
    conv = pick_conversation()

    turns, actions, max_idx, conv_id = [], [], state.get("last_idx", -1), state.get("conversation")
    chat_users, chat_replies, new_offset = [], [], state.get("transcript_offset", 0)
    if conv:
        conv_id = conv.stem
        with temp_read(conv) as c:
            turns, max_idx = extract_turns(c, state.get("last_idx", -1))
            actions = extract_actions(c, state.get("last_idx", -1))
        entries, new_offset = read_transcript(conv_id, state.get("transcript_offset", 0))
        chat_users, chat_replies = chat_pairs(entries)

    known = set(state.get("known_artifacts", []))
    new_artifacts = [p for p in brain_artifacts(conv_id) if p.name not in known]

    changed_any = bool(added or modified or deleted or turns or chat_users
                       or chat_replies or new_artifacts)
    UPDATES_DIR.mkdir(parents=True, exist_ok=True)
    asset_dir = UPDATES_DIR / "assets"
    stamp = datetime.now().strftime("%Y-%m-%d_%H%M")
    out = UPDATES_DIR / f"{stamp}.md"

    if changed_any:
        if new_artifacts:
            asset_dir.mkdir(parents=True, exist_ok=True)
            for p in new_artifacts:
                shutil.copy2(p, asset_dir / p.name)

        lines = [
            f"# Antigravity sync — {datetime.now().strftime('%d %b %Y, %H:%M')}",
            "",
            f"Conversation: `{conv_id}` · steps processed up to idx **{max_idx}**.",
            "",
        ]
        prompts = chat_users or [p for _, p in turns]
        if prompts:
            lines += ["## New requests", ""]
            for prompt in prompts:
                lines += ["> " + prompt.replace("\n", "\n> "), ""]
        if chat_replies:
            lines += ["## Assistant replies", ""]
            for reply in chat_replies:
                lines += [reply, "", "---", ""]
        elif turns:
            lines += ["_No replies in transcript window; see the condensed actions below._", ""]
        if added or modified or deleted:
            lines += ["## File changes", ""]
            if added:
                lines += ["**Added**"] + [f"- `{k}`" for k in added] + [""]
            if modified:
                lines += ["**Modified**"] + [f"- `{k}`" for k in modified] + [""]
            if deleted:
                lines += ["**Deleted**"] + [f"- `{k}`" for k in deleted] + [""]
        if new_artifacts:
            lines += ["## New plan / walkthrough artifacts", ""]
            lines += [f"- `docs/antigravity-context/08-updates/assets/{p.name}`" for p in new_artifacts]
            lines += [""]
        if actions:
            lines += ["## What the agent did (condensed)", ""] + actions + [""]

        out.write_text("\n".join(lines))
        print(f"wrote {rel(out)}")

    print(f"\nfiles: +{len(added)}  ~{len(modified)}  -{len(deleted)}")
    print(f"new requests: {len(chat_users) or len(turns)}   "
          f"new replies: {len(chat_replies)}   new artifacts: {len(new_artifacts)}")

    if rebaseline or not changed_any:
        save_json(BASELINE, {"created": datetime.now().isoformat(timespec="seconds"),
                             "conversation": conv_id, "files": snapshot_tree()})
        print("baseline refreshed (next check reports only future changes)")
    save_json(STATE, {
        "conversation": conv_id,
        "last_idx": max_idx,
        "known_artifacts": sorted(known | {p.name for p in new_artifacts}),
        "transcript_offset": new_offset,
    })


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=["snapshot", "check", "status"])
    ap.add_argument("--rebaseline", action="store_true", help="with check: accept current state as new baseline")
    args = ap.parse_args()

    if args.command == "snapshot":
        cmd_snapshot()
    elif args.command == "status":
        cmd_status()
    else:
        cmd_check(args.rebaseline)


if __name__ == "__main__":
    main()
