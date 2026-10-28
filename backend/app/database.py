from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import settings
import logging

logger = logging.getLogger("AutoPark.Database")

connect_args = {}
engine_kwargs = {"pool_pre_ping": True}

if settings.DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
    engine_kwargs["poolclass"] = NullPool

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    **engine_kwargs
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def run_migrations():
    """Idempotent schema migration for SQLite and relational databases."""
    try:
        # 1. Ensure all defined tables (users, pre_registrations, parking_slots, etc.) exist
        Base.metadata.create_all(bind=engine)

        with engine.connect() as conn:
            # Check parking_sessions table for plate_number, user_id, booking_id
            if settings.DATABASE_URL.startswith("sqlite"):
                result = conn.execute(text("PRAGMA table_info(parking_sessions)")).fetchall()
                existing_cols = [row[1] for row in result]
                
                if "plate_number" not in existing_cols and len(existing_cols) > 0:
                    conn.execute(text("ALTER TABLE parking_sessions ADD COLUMN plate_number VARCHAR(50)"))
                    conn.commit()
                    logger.info("Auto-migrated: Added 'plate_number' column to parking_sessions")

                if "user_id" not in existing_cols and len(existing_cols) > 0:
                    conn.execute(text("ALTER TABLE parking_sessions ADD COLUMN user_id INTEGER"))
                    conn.commit()
                    logger.info("Auto-migrated: Added 'user_id' column to parking_sessions")

                if "booking_id" not in existing_cols and len(existing_cols) > 0:
                    conn.execute(text("ALTER TABLE parking_sessions ADD COLUMN booking_id INTEGER"))
                    conn.commit()
                    logger.info("Auto-migrated: Added 'booking_id' column to parking_sessions")

                if "recognition_evidence" not in existing_cols and len(existing_cols) > 0:
                    conn.execute(text("ALTER TABLE parking_sessions ADD COLUMN recognition_evidence VARCHAR(1000)"))
                    conn.commit()
                    logger.info("Auto-migrated: Added 'recognition_evidence' column to parking_sessions")

                # Check detection_events table for plate_number, evidence, diagnostic_info
                result_ev = conn.execute(text("PRAGMA table_info(detection_events)")).fetchall()
                existing_ev_cols = [row[1] for row in result_ev]
                if "plate_number" not in existing_ev_cols and len(existing_ev_cols) > 0:
                    conn.execute(text("ALTER TABLE detection_events ADD COLUMN plate_number VARCHAR(50)"))
                    conn.commit()
                    logger.info("Auto-migrated: Added 'plate_number' column to detection_events")

                if "evidence" not in existing_ev_cols and len(existing_ev_cols) > 0:
                    conn.execute(text("ALTER TABLE detection_events ADD COLUMN evidence VARCHAR(1000)"))
                    conn.commit()
                    logger.info("Auto-migrated: Added 'evidence' column to detection_events")

                if "diagnostic_info" not in existing_ev_cols and len(existing_ev_cols) > 0:
                    conn.execute(text("ALTER TABLE detection_events ADD COLUMN diagnostic_info VARCHAR(500)"))
                    conn.commit()
                    logger.info("Auto-migrated: Added 'diagnostic_info' column to detection_events")

                # Safe idempotent slot capacity migration (align to configured 6 slots)
                slots_res = conn.execute(text("SELECT id, slot_number FROM parking_slots")).fetchall()
                existing_slot_map = {row[1]: row[0] for row in slots_res}
                for slot_name in settings.SLOTS:
                    if slot_name not in existing_slot_map:
                        conn.execute(
                            text("INSERT INTO parking_slots (slot_number, status, updated_at) VALUES (:s, 'AVAILABLE', CURRENT_TIMESTAMP)"),
                            {"s": slot_name}
                        )
                        conn.commit()
                        logger.info(f"Auto-migrated: Initialized slot {slot_name}")

                for s_num, s_id in existing_slot_map.items():
                    if s_num not in settings.SLOTS:
                        active_cnt = conn.execute(
                            text("SELECT COUNT(*) FROM parking_sessions WHERE slot_id = :sid AND status = 'ACTIVE'"),
                            {"sid": s_id}
                        ).scalar()
                        if active_cnt and active_cnt > 0:
                            logger.warning(f"Preserving decommissioned slot {s_num} (ID {s_id}) as it has active vehicle session(s).")
                        else:
                            conn.execute(
                                text("DELETE FROM parking_slots WHERE id = :sid"),
                                {"sid": s_id}
                            )
                            conn.commit()
                            logger.info(f"Auto-migrated: Safely removed decommissioned slot {s_num} (capacity aligned to {len(settings.SLOTS)} slots).")
    except Exception as e:
        logger.warning(f"Database migration check completed with note: {e}")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

