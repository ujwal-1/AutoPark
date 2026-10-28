#!/usr/bin/env bash
# End-to-end system verification for AutoPark.
#
#   ./scripts/verify_system.sh [port]
#
# Spins up an isolated backend on a throwaway SQLite database (default port 8010),
# exercises booking -> entry -> exit -> billing -> refusal paths, prints PASS/FAIL,
# and never touches backend/autopark.db.
set -uo pipefail

PORT="${1:-8010}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY="${AUTOPARK_PYTHON:-/opt/anaconda3/bin/python3}"
DB="/tmp/autopark_verify_$$.db"
LOG="/tmp/autopark_verify_$$.log"
BASE="http://localhost:$PORT"
PASS=0
FAIL=0
RESULTS=()

cleanup() {
  # the background PID is the subshell; kill whatever actually holds the port
  for p in $(lsof -ti:"$PORT" -sTCP:LISTEN 2>/dev/null); do kill -INT "$p" 2>/dev/null; done
  [ -n "${SRV_PID:-}" ] && kill -INT "$SRV_PID" 2>/dev/null
  sleep 0.5
  for p in $(lsof -ti:"$PORT" -sTCP:LISTEN 2>/dev/null); do kill -9 "$p" 2>/dev/null; done
  [ -n "${SRV_PID:-}" ] && wait "$SRV_PID" 2>/dev/null
  rm -f "$DB" "$LOG"
}
trap cleanup EXIT

jsonq() {
  "$PY" -c '
import sys, json
d = json.load(sys.stdin)
for p in sys.argv[1].split("."):
    d = d[int(p)] if isinstance(d, list) else d[p]
print(d)
' "$1"
}

check() { # name expected actual
  if [ "$2" = "$3" ]; then
    PASS=$((PASS+1)); RESULTS+=("PASS  $1  ($3)")
  else
    FAIL=$((FAIL+1)); RESULTS+=("FAIL  $1  expected=$2 actual=$3")
  fi
}

echo "== starting isolated backend on :$PORT =="
( cd "$ROOT/backend" && DATABASE_URL="sqlite:///$DB" "$PY" -m uvicorn app.main:app \
    --port "$PORT" --log-level error > "$LOG" 2>&1 ) &
SRV_PID=$!

for _ in $(seq 1 40); do
  curl -s -m 1 -o /dev/null "$BASE/health" && break
  sleep 1
done
curl -s -m 2 -o /dev/null "$BASE/health" || { echo "backend failed to start"; tail -20 "$LOG"; exit 1; }

register() { # username
  curl -s -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' \
    -d "{\"username\":\"$1\",\"password\":\"testpass123\",\"full_name\":\"$1\"}" \
    | jsonq access_token
}

book() { # token plate slot
  curl -s -X POST "$BASE/api/bookings/pre-checkin" \
    -H "Authorization: Bearer $1" -H 'Content-Type: application/json' \
    -d "{\"plate_number\":\"$2\",\"vehicle_type\":\"Car\",\"duration_hours\":2,\"slot_number\":\"$3\"}"
}

echo "== registering test users =="
T1=$(register verify_a)
T2=$(register verify_b)
[ -n "$T1" ] && [ -n "$T2" ] || { echo "registration failed"; exit 1; }

# --- T1: booking honours the requested bay ---------------------------------
R=$(book "$T1" KA05KK0403 B3)
check "T1 book requested bay" "B3" "$(echo "$R" | jsonq slot_number)"

# --- T2: entry allocates the booked bay and opens the barrier --------------
R=$(curl -s -X POST "$BASE/api/parking/simulate/entry?plate_number=KA05KK0403")
check "T2 entry status"      "allocated" "$(echo "$R" | jsonq status)"
check "T2 entry bay"         "B3"        "$(echo "$R" | jsonq slot)"
check "T2 barrier open flag" "True"      "$(echo "$R" | jsonq open_barrier)"

# --- T3: duplicate frame is idempotent -------------------------------------
R=$(curl -s -X POST "$BASE/api/parking/simulate/entry?plate_number=KA05KK0403")
check "T3 duplicate entry" "already_allocated" "$(echo "$R" | jsonq status)"

# --- T4: exit releases the bay and bills the first hour --------------------
R=$(curl -s -X POST "$BASE/api/parking/simulate/exit")
check "T4 exit status"  "released" "$(echo "$R" | jsonq status)"
check "T4 released bay" "B3"       "$(echo "$R" | jsonq slot)"
check "T4 amount (<=60m)" "30"     "$(echo "$R" | jsonq billed_amount)"

# --- T5: cancelling a booking frees the bay --------------------------------
R=$(book "$T1" KA05KK0403 A2)
BID=$(echo "$R" | jsonq id)
curl -s -X DELETE "$BASE/api/bookings/$BID" -H "Authorization: Bearer $T1" -o /dev/null
R=$(curl -s "$BASE/api/parking/layout")
check "T5 cancel frees bay" "AVAILABLE" \
  "$(echo "$R" | "$PY" -c 'import sys,json;print([s["status"] for s in json.load(sys.stdin)["slots"] if s["slot_number"]=="A2"][0])')"

# --- T6: unknown plate is refused, barrier stays closed --------------------
R=$(curl -s -X POST "$BASE/api/parking/simulate/entry?authorized=false")
check "T6 unauthorized status" "unauthorized" "$(echo "$R" | jsonq status)"
check "T6 barrier stays shut"  "False"        "$(echo "$R" | jsonq open_barrier)"

# --- T7: two similar bookings -> ambiguous refusal -------------------------
book "$T1" KA05KK0403 A1 > /dev/null
book "$T2" KA05KK0404 A3 > /dev/null
# Use the detection endpoint (not the simulator: the simulator auto-creates a
# fallback booking, which would mask the ambiguity we are testing).
R=$(curl -s -X POST "$BASE/api/detection/entry" \
  -F "plate_number=KA05KK0405" -F "confidence=0.95" -F "vehicle_type=Car")
check "T7 ambiguous refused" "ambiguous" "$(echo "$R" | jsonq status)"
check "T7 no barrier open"   "False"     "$(echo "$R" | jsonq open_barrier)"

# clear bookings and any state left by the refusal test
curl -s -X POST "$BASE/api/parking/reset" -o /dev/null

# --- T8: 61-minute stay bills the second hour block ------------------------
book "$T1" KA05KK0403 B3 > /dev/null
curl -s -X POST "$BASE/api/detection/entry" \
  -F "plate_number=KA05KK0403" -F "confidence=0.95" -F "vehicle_type=Car" -o /dev/null
"$PY" - "$DB" <<'EOF'
import sqlite3, sys
from datetime import datetime, timedelta, timezone
db = sqlite3.connect(sys.argv[1])
past = (datetime.now(timezone.utc) - timedelta(minutes=61)).strftime("%Y-%m-%d %H:%M:%S.%f")
db.execute("update parking_sessions set entry_time=? where status='ACTIVE'", (past,))
db.commit()
EOF
R=$(curl -s -X POST "$BASE/api/parking/simulate/exit")
check "T8 duration ~61m" "61" "$(echo "$R" | jsonq duration_minutes)"
check "T8 amount (61m)"  "50" "$(echo "$R" | jsonq billed_amount)"

echo
echo "==================== RESULTS ===================="
printf '%s\n' "${RESULTS[@]}"
echo "-------------------------------------------------"
echo "PASS=$PASS  FAIL=$FAIL"
echo "================================================="
[ "$FAIL" -eq 0 ]
