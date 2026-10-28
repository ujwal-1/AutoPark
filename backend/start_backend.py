"""
AutoPark - Start Backend Server
Delegates to run_persistent_backend to ensure persistent restart on crash,
duplicate instance prevention, and Windows compatibility.
"""
import os
import sys

backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from run_persistent_backend import run_supervisor

if __name__ == "__main__":
    run_supervisor()
