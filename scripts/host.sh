#!/usr/bin/env bash
# Host AutoPark locally (LAN-accessible), independent of any IDE/terminal.
#   ./scripts/host.sh start | stop | status | logs
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN="$ROOT/.run"
PY="${AUTOPARK_PYTHON:-/opt/anaconda3/bin/python3}"
mkdir -p "$RUN"

lan_ip() { ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "127.0.0.1"; }

stop_all() {
  # match our own processes by working dir / port, not by name
  for port in 8000 3000; do
    pids=$(lsof -ti:$port -sTCP:LISTEN 2>/dev/null)
    [ -n "$pids" ] && kill $pids 2>/dev/null
  done
  pkill -f "uvicorn app.main:app" 2>/dev/null
  sleep 1
  for port in 8000 3000; do
    pids=$(lsof -ti:$port -sTCP:LISTEN 2>/dev/null)
    [ -n "$pids" ] && kill -9 $pids 2>/dev/null
  done
  return 0
}

wait_for() {
  local url=$1 name=$2 n=45
  for _ in $(seq 1 $n); do
    curl -s -m 2 -o /dev/null "$url" && { echo "  $name up"; return 0; }
    sleep 1
  done
  echo "  $name DID NOT COME UP — see $RUN"; return 1
}

start_all() {
  stop_all
  echo "starting backend..."
  ( cd "$ROOT/backend" && nohup "$PY" -m uvicorn app.main:app \
      --host 0.0.0.0 --port 8000 --log-level info \
      > "$RUN/backend.log" 2>&1 & echo $! > "$RUN/backend.pid" )

  echo "starting frontend..."
  ( cd "$ROOT/frontend" && nohup npm run dev \
      > "$RUN/frontend.log" 2>&1 & echo $! > "$RUN/frontend.pid" )

  wait_for http://localhost:8000/health "backend " || true
  wait_for http://localhost:3000/ "frontend" || true

  IP=$(lan_ip)
  cat <<EOF

  Dashboard   http://localhost:3000        (LAN: http://$IP:3000)
  API docs    http://localhost:8000/docs   (LAN: http://$IP:8000/docs)
  WebSocket   ws://$IP:8000/ws/parking
  Logs        $RUN/{backend,frontend}.log

  Stop with:  ./scripts/host.sh stop
EOF
}

case "${1:-start}" in
  start)  start_all ;;
  stop)   stop_all; echo "stopped" ;;
  status)
    for port in 8000 3000; do
      if lsof -ti:$port -sTCP:LISTEN >/dev/null 2>&1; then echo "port $port: UP"; else echo "port $port: down"; fi
    done
    echo "LAN IP: $(lan_ip)"
    ;;
  logs)   tail -n 40 "$RUN/backend.log" "$RUN/frontend.log" 2>/dev/null ;;
  *) echo "usage: $0 {start|stop|status|logs}"; exit 1 ;;
esac
