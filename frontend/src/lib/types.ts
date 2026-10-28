export type SlotStatus = 'AVAILABLE' | 'ALLOCATED' | 'OCCUPIED' | 'BLOCKED' | 'MAINTENANCE';

export type CameraOnlineStatus = 'ONLINE' | 'OFFLINE' | 'UNKNOWN';

export interface ActiveSessionInfo {
  session_id: number;
  vehicle_type: string;
  plate_number?: string | null;
  entry_time: string;
}

export interface ParkingSlotData {
  id: number;
  slot_number: string;
  status: SlotStatus;
  updated_at: string;
  active_session?: ActiveSessionInfo | null;
}

export interface ParkingSummary {
  total_slots: number;
  available: number;
  allocated: number;
  occupied: number;
  blocked: number;
  active_bookings?: number;
}

export type BarrierState = 'LOCKED' | 'OPEN' | 'CLOSING';

export interface BarrierStatus {
  entry: BarrierState;
  exit: BarrierState;
  lastEntryTime?: string | null;
  lastExitTime?: string | null;
}

export interface ExitReceiptData {
  slot: string;
  plateNumber: string;
  durationFormatted: string;
  billedAmount: number;
  exitTime: string;
  /** true while the vehicle is still parked — no exit has been recorded yet */
  active?: boolean;
  entryTime?: string;
}

export interface ActivityEvent {
  id: string;
  timestamp: string;
  message: string;
  type: 'allocated' | 'released' | 'detected' | 'exited' | 'full' | 'buzzer' | 'reset' | 'unauthorized' | 'booking' | 'barrier';
  slot?: string;
  plate_number?: string | null;
}

export interface DetectionResult {
  status: string;
  message: string;
  slot?: string | null;
  trigger_buzzer: boolean;
  confidence: number;
  camera: 'ENTRY' | 'EXIT';
  vehicle_type: string;
  plate_number?: string | null;
}

export interface CameraDetectionState {
  camera: 'ENTRY' | 'EXIT';
  vehicle_type?: string;
  plate_number?: string | null;
  raw_candidate?: string | null;
  is_verified: boolean;
  confidence?: number | null;
  slot?: string | null;
  status: 'IDLE' | 'ALLOCATED' | 'RELEASED' | 'UNAUTHORIZED' | 'NO_PLATE' | 'NO_SESSION' | 'AMBIGUOUS' | 'ERROR';
  failure_stage?: string | null;
  timestamp?: string | null;
  message?: string;
  camera_online_status: CameraOnlineStatus;
  last_frame_timestamp?: number | null;
}

export interface DiagnosticEvent {
  id: string;
  camera: 'ENTRY' | 'EXIT';
  timestamp: string;
  quality: {
    sharpness: number;
    brightness: number;
    contrast: number;
    is_blurry: boolean;
    quality_grade: string;
  };
  plate_detected: boolean;
  plate_bbox?: number[] | null;
  plate_conf?: number;
  candidates: Array<{
    text: string;
    canonical: string;
    confidence: number;
    votes?: number;
    variants?: string[];
  }>;
  selected_plate?: string | null;
  failure_stage?: string | null;
  reason: string;
  timing?: {
    decode_ms: number;
    plate_ms: number;
    ocr_ms: number;
    veh_ms: number;
    total_ms: number;
  };
}

export interface UserProfile {
  id: number;
  username: string;
  email?: string | null;
  full_name?: string | null;
  phone?: string | null;
  role: string;
  created_at?: string | null;
}

export interface PreCheckinData {
  id: number;
  user_id: number;
  driver_name?: string | null;
  plate_number: string;
  vehicle_type: string;
  status: 'PENDING_ARRIVAL' | 'CHECKED_IN' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
  created_at: string;
  expires_at?: string | null;
  slot_number?: string | null;
}

export interface ParkingHistoryData {
  id: number;
  vehicle_type: string;
  plate_number?: string | null;
  slot_number?: string | null;
  entry_time?: string | null;
  exit_time?: string | null;
  status: string;
  booking_id?: number | null;
}

export interface MyStatusData {
  user: UserProfile;
  active_booking?: PreCheckinData | null;
  active_session?: ParkingHistoryData | null;
  has_active_entry: boolean;
}
