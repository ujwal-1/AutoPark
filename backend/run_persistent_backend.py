"""
AutoPark Persistent Backend Supervisor (Windows & Cross-Platform)
-----------------------------------------------------------------
Features:
- Runs Uvicorn on 0.0.0.0:8000 from the backend directory.
- Detects and prevents duplicate server instances on port 8000.
- Uses existing virtual environment if present, otherwise current Python executable.
- Monitors the backend process and automatically restarts it if it crashes.
- Implements a 5-second backoff delay on crashes to prevent continuous rapid restart loops.
- Logs all startup events, crash codes, and restarts to both console and backend_supervisor.log.
- Cleanly exits when deliberately stopped (Ctrl+C).
"""

import sys
import os
import time
import socket
import subprocess
import signal
import datetime

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(BACKEND_DIR, "backend_supervisor.log")
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
RESTART_DELAY_SECONDS = 5

def log(msg: str):
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    formatted = f"[{timestamp}] [AutoPark Supervisor] {msg}"
    print(formatted, flush=True)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(formatted + "\n")
    except Exception:
        pass

def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1.0)
        return s.connect_ex((host, port)) == 0

def find_python_executable() -> str:
    # Check common virtual environment locations relative to project
    root_dir = os.path.dirname(BACKEND_DIR)
    candidates = [
        os.path.join(root_dir, ".venv", "Scripts", "python.exe"),
        os.path.join(root_dir, "venv", "Scripts", "python.exe"),
        os.path.join(BACKEND_DIR, ".venv", "Scripts", "python.exe"),
        os.path.join(BACKEND_DIR, "venv", "Scripts", "python.exe"),
        sys.executable
    ]
    for c in candidates:
        if os.path.isfile(c):
            return c
    return sys.executable

def run_supervisor():
    python_exe = find_python_executable()
    log("==================================================")
    log(f"Starting AutoPark Persistent Backend Supervisor")
    log(f"Backend Directory: {BACKEND_DIR}")
    log(f"Python Executable: {python_exe}")
    log(f"Binding: {HOST}:{PORT}")
    log("==================================================")

    # Check for duplicate running instance
    if is_port_in_use(PORT):
        log(f"ERROR: Port {PORT} is already in use by another running process!")
        log("Aborting to avoid starting duplicate server instances.")
        log("If an old server process is still running, stop it before starting this supervisor.")
        sys.exit(1)

    restart_count = 0

    while True:
        # Check port before each launch
        if is_port_in_use(PORT):
            log(f"Warning: Port {PORT} is occupied. Waiting {RESTART_DELAY_SECONDS}s before re-checking...")
            time.sleep(RESTART_DELAY_SECONDS)
            continue

        cmd = [python_exe, "-m", "uvicorn", "app.main:app", "--host", HOST, "--port", str(PORT)]
        log(f"Launching Uvicorn server: {' '.join(cmd)}")
        
        proc = None
        start_time = time.time()
        try:
            proc = subprocess.Popen(cmd, cwd=BACKEND_DIR)
            
            # Wait for child process to terminate
            while proc.poll() is None:
                try:
                    time.sleep(0.5)
                except KeyboardInterrupt:
                    raise KeyboardInterrupt

            exit_code = proc.returncode
            run_duration = time.time() - start_time
            log(f"Server process terminated with exit code {exit_code} (Ran for {run_duration:.1f}s).")

            # Exit code 0 or negative signals (SIGTERM/SIGINT) indicates deliberate stop
            if exit_code == 0 or exit_code in (-signal.SIGINT, -signal.SIGTERM, 3221225786):
                log("Server stopped deliberately. Exiting supervisor.")
                break

            restart_count += 1
            log(f"Crash detected! Restart count: {restart_count}")
            log(f"Waiting {RESTART_DELAY_SECONDS}s before automatic restart to prevent rapid crash loops...")
            time.sleep(RESTART_DELAY_SECONDS)

        except KeyboardInterrupt:
            log("Received Ctrl+C / KeyboardInterrupt. Terminating backend server...")
            if proc and proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
            log("Backend supervisor stopped successfully by user.")
            break
        except Exception as e:
            log(f"Unexpected supervisor error: {e}")
            log(f"Waiting {RESTART_DELAY_SECONDS}s before retry...")
            time.sleep(RESTART_DELAY_SECONDS)

if __name__ == "__main__":
    run_supervisor()
