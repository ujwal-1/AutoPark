from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class DetectionRequest(BaseModel):
    vehicle_type: str = Field(default="car", description="Type of vehicle detected")
    plate_number: Optional[str] = Field(default=None, description="License plate number")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score between 0 and 1")

class DetectionResponse(BaseModel):
    status: str
    message: str
    slot: Optional[str] = None
    trigger_buzzer: bool = False
    open_barrier: bool = False
    barrier_action: str = "LOCKED"
    confidence: float
    camera: str
    vehicle_type: str
    plate_number: Optional[str] = None
    session_id: Optional[int] = None
    duration_minutes: Optional[int] = None
    duration_formatted: Optional[str] = None
    billed_amount: Optional[int] = None
    entry_time: Optional[str] = None
    exit_time: Optional[str] = None

class SlotStatusSchema(BaseModel):
    id: int
    slot_number: str
    status: str
    updated_at: str

    class Config:
        from_attributes = True

class SummaryResponse(BaseModel):
    total_slots: int
    available: int
    allocated: int
    occupied: int
    blocked: int
    active_bookings: int = 0

class ActivityEventSchema(BaseModel):
    timestamp: str
    message: str
    event_type: str
    slot: Optional[str] = None

class WebSocketMessage(BaseModel):
    type: str  # vehicle.detected, slot.allocated, slot.occupied, vehicle.exited, slot.released, parking.full, buzzer.triggered, camera.status, entry.unauthorized, booking.created, booking.checked_in
    data: dict


# ==================== AUTH & USER SCHEMAS ====================

class UserRegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6, max_length=100)
    email: Optional[str] = None
    full_name: Optional[str] = None
    phone: Optional[str] = None

class UserLoginRequest(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: int
    username: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    phone: Optional[str] = None
    role: str
    created_at: Optional[str] = None

    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# ==================== PRE-CHECKIN & BOOKING SCHEMAS ====================

class PreCheckinRequest(BaseModel):
    plate_number: str = Field(..., min_length=4, max_length=20, description="Vehicle license plate")
    vehicle_type: str = Field(default="car", description="Type of vehicle")
    duration_hours: Optional[int] = Field(default=2, ge=1, le=24, description="Validity duration in hours")
    slot_number: Optional[str] = Field(default=None, description="Preferred or pre-selected parking bay (e.g. A1, A2, B1)")

class PreCheckinResponse(BaseModel):
    id: int
    user_id: int
    driver_name: Optional[str] = None
    plate_number: str
    vehicle_type: str
    status: str
    created_at: str
    expires_at: Optional[str] = None
    slot_number: Optional[str] = None

class ParkingHistoryItem(BaseModel):
    id: int
    vehicle_type: str
    plate_number: Optional[str] = None
    slot_number: Optional[str] = None
    entry_time: Optional[str] = None
    exit_time: Optional[str] = None
    status: str
    booking_id: Optional[int] = None

class MyStatusResponse(BaseModel):
    user: UserResponse
    active_booking: Optional[PreCheckinResponse] = None
    active_session: Optional[ParkingHistoryItem] = None
    has_active_entry: bool = False

