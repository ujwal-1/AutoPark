import os
import sys
import tempfile
import pytest

# Ensure isolated test database for automated testing to never touch or reset the real autopark.db
TEST_DB_PATH = os.path.normpath(os.path.join(tempfile.gettempdir(), "autopark_automated_test.db")).replace(os.sep, "/")
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH}"

# Add backend directory to sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.database import Base, engine, run_migrations, SessionLocal
from app.slot_allocator import init_slots_db, clear_cooldowns

@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    """Sets up an isolated test database once for the entire test session."""
    run_migrations()
    db = SessionLocal()
    init_slots_db(db)
    db.close()
    yield
    # Cleanup test db file after session if desired
    try:
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)
    except Exception:
        pass
