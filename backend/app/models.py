from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from app.database import Base

def utcnow():
    return datetime.now(timezone.utc)

def to_utc(dt):
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


class ParkingSlot(Base):
    __tablename__ = "parking_slots"

    id = Column(Integer, primary_key=True, index=True)
    slot_number = Column(String(10), unique=True, index=True, nullable=False)
    status = Column(String(20), default="AVAILABLE", nullable=False) # AVAILABLE, ALLOCATED, OCCUPIED, BLOCKED, MAINTENANCE
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    sessions = relationship("ParkingSession", back_populates="slot")
    bookings = relationship("PreRegistration", back_populates="slot")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(100), nullable=True)
    phone = Column(String(20), nullable=True)
    role = Column(String(20), default="driver", nullable=False) # driver, admin
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    bookings = relationship("PreRegistration", back_populates="user", cascade="all, delete-orphan")
    sessions = relationship("ParkingSession", back_populates="user")


class PreRegistration(Base):
    __tablename__ = "pre_registrations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    plate_number = Column(String(50), index=True, nullable=False)
    vehicle_type = Column(String(80), default="car", nullable=False)
    status = Column(String(20), default="PENDING_ARRIVAL", nullable=False) # PENDING_ARRIVAL, CHECKED_IN, COMPLETED, CANCELLED, EXPIRED
    slot_id = Column(Integer, ForeignKey("parking_slots.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    checked_in_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="bookings")
    slot = relationship("ParkingSlot", back_populates="bookings")
    session = relationship("ParkingSession", back_populates="booking", uselist=False)


class ParkingSession(Base):
    __tablename__ = "parking_sessions"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_type = Column(String(80), default="car", nullable=False)
    plate_number = Column(String(50), nullable=True)
    slot_id = Column(Integer, ForeignKey("parking_slots.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    booking_id = Column(Integer, ForeignKey("pre_registrations.id"), nullable=True)
    entry_time = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    exit_time = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(20), default="ACTIVE", nullable=False) # ACTIVE, COMPLETED
    recognition_evidence = Column(String(1000), nullable=True)

    slot = relationship("ParkingSlot", back_populates="sessions")
    user = relationship("User", back_populates="sessions")
    booking = relationship("PreRegistration", back_populates="session")


class DetectionEvent(Base):
    __tablename__ = "detection_events"

    id = Column(Integer, primary_key=True, index=True)
    camera = Column(String(20), nullable=False) # ENTRY, EXIT
    vehicle_type = Column(String(80), default="car", nullable=False)
    plate_number = Column(String(50), nullable=True)
    confidence = Column(Float, nullable=False)
    detected_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    processed = Column(Boolean, default=True)
    allocated_slot_number = Column(String(10), nullable=True)
    evidence = Column(String(1000), nullable=True)
    diagnostic_info = Column(String(500), nullable=True)

