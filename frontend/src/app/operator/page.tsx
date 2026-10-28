'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Navbar } from '../../components/Navbar';
import { StatsOverview } from '../../components/StatsOverview';
import { NotificationBanner } from '../../components/NotificationBanner';
import { ParkingLayout } from '../../components/ParkingLayout';
import { LiveCameraFeed } from '../../components/LiveCameraFeed';
import { LiveActivityLog } from '../../components/LiveActivityLog';
import { DemoControls } from '../../components/DemoControls';
import { ExitReceiptModal } from '../../components/ExitReceiptModal';
import {
  ParkingSlotData,
  ParkingSummary,
  ActivityEvent,
  CameraDetectionState,
  CameraOnlineStatus,
  DiagnosticEvent,
  ExitReceiptData,
} from '../../lib/types';
import { getApiBaseUrl, getWsUrl } from '../../lib/config';
import {
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  Cpu,
  Radio,
  Sliders,
  Sparkles,
} from 'lucide-react';

export default function OperatorPage() {
  const [slots, setSlots] = useState<ParkingSlotData[]>([]);
  const [summary, setSummary] = useState<ParkingSummary>({
    total_slots: 6,
    available: 6,
    allocated: 0,
    occupied: 0,
    blocked: 0,
  });
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [systemOnline, setSystemOnline] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticEvent[]>([]);
  const [exitReceipt, setExitReceipt] = useState<ExitReceiptData | null>(null);

  // Entry and Exit Camera Detection States
  const [entryDetection, setEntryDetection] = useState<CameraDetectionState>({
    camera: 'ENTRY',
    vehicle_type: 'Car',
    plate_number: null,
    raw_candidate: null,
    is_verified: false,
    confidence: null,
    slot: null,
    status: 'IDLE',
    timestamp: null,
    message: 'Awaiting incoming vehicle at entry gate...',
    camera_online_status: 'UNKNOWN',
    last_frame_timestamp: null,
  });

  const [exitDetection, setExitDetection] = useState<CameraDetectionState>({
    camera: 'EXIT',
    vehicle_type: 'Car',
    plate_number: null,
    raw_candidate: null,
    is_verified: false,
    confidence: null,
    slot: null,
    status: 'IDLE',
    timestamp: null,
    message: 'Awaiting exiting vehicle at exit gate...',
    camera_online_status: 'UNKNOWN',
    last_frame_timestamp: null,
  });

  const entryLastSeenRef = useRef<number | null>(null);
  const exitLastSeenRef = useRef<number | null>(null);

  // Unauthorized Entry Warning Alert State
  const [unauthorizedWarning, setUnauthorizedWarning] = useState<{
    plateNumber: string;
    message: string;
  } | null>(null);

  const apiBase = getApiBaseUrl();

  // Notification Banner State
  const [assignedBanner, setAssignedBanner] = useState<{
    slot: string | null;
    vehicleType: string;
    plateNumber?: string | null;
    triggerBuzzer: boolean;
  }>({
    slot: null,
    vehicleType: '',
    plateNumber: null,
    triggerBuzzer: false,
  });

  const addEventLog = (
    message: string,
    type: ActivityEvent['type'],
    slot?: string,
    plate_number?: string | null
  ) => {
    const newEvt: ActivityEvent = {
      id: Math.random().toString(36).substring(7),
      timestamp: new Date().toLocaleTimeString(),
      message,
      type,
      slot,
      plate_number,
    };
    setEvents((prev) => [newEvt, ...prev.slice(0, 49)]);
  };

  // Periodic Camera Online / Offline status evaluation (Every 2 seconds)
  useEffect(() => {
    const checkCameraStatus = () => {
      const now = Date.now();
      const timeoutThreshold = 25000;

      setEntryDetection((prev) => {
        let status: CameraOnlineStatus = 'UNKNOWN';
        if (entryLastSeenRef.current) {
          status = now - entryLastSeenRef.current < timeoutThreshold ? 'ONLINE' : 'OFFLINE';
        }
        if (prev.camera_online_status === status && prev.last_frame_timestamp === entryLastSeenRef.current) {
          return prev;
        }
        return {
          ...prev,
          camera_online_status: status,
          last_frame_timestamp: entryLastSeenRef.current,
        };
      });

      setExitDetection((prev) => {
        let status: CameraOnlineStatus = 'UNKNOWN';
        if (exitLastSeenRef.current) {
          status = now - exitLastSeenRef.current < timeoutThreshold ? 'ONLINE' : 'OFFLINE';
        }
        if (prev.camera_online_status === status && prev.last_frame_timestamp === exitLastSeenRef.current) {
          return prev;
        }
        return {
          ...prev,
          camera_online_status: status,
          last_frame_timestamp: exitLastSeenRef.current,
        };
      });
    };

    const statusInterval = setInterval(checkCameraStatus, 2000);
    return () => clearInterval(statusInterval);
  }, []);

  // Fetch live state from backend
  const fetchParkingState = useCallback(async () => {
    try {
      const [slotsRes, summaryRes] = await Promise.all([
        fetch(`${apiBase}/api/parking/slots`),
        fetch(`${apiBase}/api/parking/summary`),
      ]);

      if (slotsRes.ok && summaryRes.ok) {
        const slotsData = await slotsRes.json();
        const summaryData = await summaryRes.json();
        setSlots(slotsData);
        setSummary(summaryData);
        setSystemOnline(true);
      } else {
        setSystemOnline(false);
      }
    } catch {
      setSystemOnline(false);
    }
  }, [apiBase]);

  const fetchDiagnostics = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/anpr/diagnostics?limit=15`);
      if (res.ok) {
        const payload = await res.json();
        // The endpoint wraps the list in an envelope:
        // { status, timestamp, events, diagnostics }. Accept a bare array too.
        const list = Array.isArray(payload)
          ? payload
          : payload?.diagnostics ?? payload?.events ?? [];
        setDiagnostics(Array.isArray(list) ? list : []);
      }
    } catch {
      // Non-critical
    }
  }, [apiBase]);

  // WebSocket lifecycle & Automatic Reconnection
  useEffect(() => {
    fetchParkingState();
    fetchDiagnostics();

    let ws: WebSocket | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let pingTimer: NodeJS.Timeout | null = null;
    let fallbackPollTimer: NodeJS.Timeout | null = null;
    let isMounted = true;

    const startFallbackPolling = () => {
      if (fallbackPollTimer) clearInterval(fallbackPollTimer);
      fallbackPollTimer = setInterval(() => {
        if (!isMounted) return;
        fetchParkingState();
        fetchDiagnostics();
      }, 4000);
    };

    const stopFallbackPolling = () => {
      if (fallbackPollTimer) {
        clearInterval(fallbackPollTimer);
        fallbackPollTimer = null;
      }
    };

    const connectWS = () => {
      if (!isMounted) return;

      const wsUrl = getWsUrl();
      try {
        ws = new WebSocket(wsUrl);
      } catch (err) {
        setWsConnected(false);
        startFallbackPolling();
        reconnectTimer = setTimeout(connectWS, 4000);
        return;
      }

      ws.onopen = () => {
        if (!isMounted) return;
        setWsConnected(true);
        setSystemOnline(true);
        stopFallbackPolling();

        fetchParkingState();
        fetchDiagnostics();

        if (pingTimer) clearInterval(pingTimer);
        pingTimer = setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send('ping');
          }
        }, 15000);
      };

      ws.onmessage = (event) => {
        if (!isMounted) return;
        try {
          if (event.data === 'pong') return;
          const message = JSON.parse(event.data);
          const { type, data } = message;

          if (type === 'slot.allocated') {
            entryLastSeenRef.current = Date.now();
            fetchParkingState();
            // Backend sends `vehicle`, older payloads used `vehicle_type`.
            const vehicle = data.vehicle ?? data.vehicle_type ?? 'Vehicle';
            addEventLog(
              `Entry Gate: ${vehicle} (${data.plate_number || 'Detected'}) assigned to Slot ${data.slot}`,
              'allocated',
              data.slot,
              data.plate_number
            );

            setAssignedBanner({
              slot: data.slot,
              vehicleType: vehicle,
              plateNumber: data.plate_number,
              triggerBuzzer: true,
            });

            setEntryDetection((prev) => ({
              ...prev,
              slot: data.slot,
              status: 'ALLOCATED',
              confidence: data.confidence ?? null,
              plate_number: data.plate_number,
              message: `Entry Authorized: Vehicle assigned to Slot ${data.slot}. Entry Boom Barrier raised (90°)!`,
              camera_online_status: 'ONLINE',
              last_frame_timestamp: Date.now(),
            }));
          } else if (type === 'slot.released') {
            exitLastSeenRef.current = Date.now();
            fetchParkingState();
            addEventLog(`Slot ${data.slot} vacated & ready for booking`, 'released', data.slot);
          } else if (type === 'barrier.entry') {
            entryLastSeenRef.current = Date.now();
            addEventLog(
              `Servo Barrier: Entry Gate lifted to 90° for ${data.plate ?? 'vehicle'} -> Bay ${data.slot ?? '—'}`,
              'barrier',
              data.slot,
              data.plate
            );
          } else if (type === 'vehicle.exited') {
            exitLastSeenRef.current = Date.now();
            fetchParkingState();
            addEventLog(
              `Exit Gate: ${data.plate_number || 'Vehicle'} departed from Slot ${data.slot ?? '—'}`,
              'exited',
              data.slot,
              data.plate_number
            );

            setExitDetection((prev) => ({
              ...prev,
              slot: data.slot ?? null,
              status: 'ALLOCATED',
              confidence: null,
              plate_number: data.plate_number ?? null,
              message: `Exit Authorized: ${data.plate_number || 'Vehicle'} departed. Boom barrier opened (90°)!`,
              camera_online_status: 'ONLINE',
              last_frame_timestamp: Date.now(),
            }));

            setExitReceipt({
              slot: data.slot ?? '—',
              plateNumber: data.plate_number ?? '—',
              durationFormatted: data.duration_formatted ?? '—',
              billedAmount: data.billed_amount ?? null,
              exitTime: new Date().toLocaleTimeString(),
            });
          } else if (type === 'barrier.exit') {
            exitLastSeenRef.current = Date.now();
            addEventLog(
              `Servo Barrier: Exit Gate lifted to 90° for ${data.plate ?? 'vehicle'}${data.billed_amount != null ? ` • Fee ₹${data.billed_amount}` : ''}`,
              'barrier',
              data.slot,
              data.plate
            );
          } else if (type === 'entry.unauthorized') {
            entryLastSeenRef.current = Date.now();
            addEventLog(
              `Access Denied: Unregistered vehicle (${data.plate_number || 'UNKNOWN'}). Barrier remains locked at 0°.`,
              'unauthorized',
              undefined,
              data.plate_number
            );

            setUnauthorizedWarning({
              plateNumber: data.plate_number || 'UNKNOWN',
              message: data.message || 'Advance booking required. Entry boom barrier is locked (0°).',
            });

            setEntryDetection((prev) => ({
              ...prev,
              plate_number: data.plate_number,
              status: 'UNAUTHORIZED',
              confidence: data.confidence ?? null,
              message: 'ENTRY REJECTED: No advance reservation found.',
              camera_online_status: 'ONLINE',
              last_frame_timestamp: Date.now(),
            }));
          } else if (type === 'parking.full') {
            addEventLog('Parking capacity reached! All 6 bays occupied.', 'full');
          } else if (type === 'demo.reset' || type === 'parking.reset') {
            setAssignedBanner({ slot: null, vehicleType: '', plateNumber: null, triggerBuzzer: false });
            setUnauthorizedWarning(null);
            setExitReceipt(null);
            fetchParkingState();
            fetchDiagnostics();
            addEventLog('Facility reset: All slots reset to AVAILABLE', 'reset');
          } else if (type === 'booking.created' || type === 'booking.cancelled') {
            fetchParkingState();
          }
        } catch (err) {
          console.error('WS Parse error:', err);
        }
      };

      ws.onclose = () => {
        if (!isMounted) return;
        setWsConnected(false);
        if (pingTimer) clearInterval(pingTimer);
        startFallbackPolling();
        reconnectTimer = setTimeout(connectWS, 4000);
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connectWS();

    return () => {
      isMounted = false;
      stopFallbackPolling();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pingTimer) clearInterval(pingTimer);
      if (ws) ws.close();
    };
  }, [fetchParkingState, fetchDiagnostics]);

  // Operator Handlers
  const handleManualRelease = async (slotNumber: string) => {
    try {
      const res = await fetch(`${apiBase}/api/parking/release/${slotNumber}`, { method: 'POST' });
      if (res.ok) {
        fetchParkingState();
        addEventLog(`Slot ${slotNumber} manually cleared by operator`, 'released', slotNumber);
      }
    } catch {
      alert('Failed to release slot');
    }
  };

  const handleSimulateEntry = async (authorized: boolean = true) => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/parking/simulate/entry?authorized=${authorized}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Entry simulation failed');
      fetchParkingState();
    } catch (err: any) {
      alert(err.message || 'Error simulating vehicle entry');
    } finally {
      setLoading(false);
    }
  };

  const handleSimulateExit = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/parking/simulate/exit`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Exit simulation failed');
      fetchParkingState();
    } catch (err: any) {
      alert(err.message || 'Error simulating vehicle exit');
    } finally {
      setLoading(false);
    }
  };

  const handleResetDemo = async () => {
    if (!confirm('Reset all 6 slots and clear active sessions?')) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/parking/reset`, { method: 'POST' });
      if (res.ok) {
        fetchParkingState();
        fetchDiagnostics();
        setAssignedBanner({ slot: null, vehicleType: '', plateNumber: null, triggerBuzzer: false });
        setUnauthorizedWarning(null);
      }
    } catch {
      alert('Error resetting demo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-districtBg text-white flex flex-col selection:bg-white/20 selection:text-white relative">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col relative z-10">
        {/* Operator Console Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/[0.08]">
          <div>
            <div className="flex items-center gap-2 text-zinc-400 text-xs font-bold tracking-wider uppercase mb-1">
              <Cpu className="w-4 h-4 text-zinc-400" />
              <span>Facility Command Center • Hardware-in-the-Loop</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
              Operator &amp; Evaluator Console
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1">
              Live dual ESP32-CAM optical feeds, SG90 servo boom barrier telemetry, 2D digital twin, and simulation bench.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#18181B] border border-white/10 text-xs backdrop-blur-md shadow-sm">
              <Radio className={`w-3.5 h-3.5 ${wsConnected ? 'text-emerald-400 animate-pulse' : 'text-zinc-500'}`} />
              <span className="font-mono text-zinc-300">
                {wsConnected ? 'Telemetry Stream LIVE' : 'WS Disconnected (Polling)'}
              </span>
            </div>

            <button
              onClick={() => {
                fetchParkingState();
                fetchDiagnostics();
              }}
              className="district-btn-secondary inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold"
            >
              <RefreshCw className="w-3.5 h-3.5 text-zinc-300" />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Offline / Error Warning */}
        {!systemOnline && (
          <div className="mt-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-3 text-rose-300 text-xs">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>
              Backend API appears unreachable at <code className="font-mono">{apiBase}</code>. Ensure the FastAPI server is running.
            </span>
          </div>
        )}

        {/* Unauthorized Entry Warning Alert */}
        {unauthorizedWarning && (
          <div className="mt-4 p-4 rounded-2xl bg-amber-500/15 border-2 border-amber-500/60 shadow-xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-500 text-slate-950 rounded-xl font-bold">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-amber-400">
                    Gate Access Denied • Barrier Remains at 0°
                  </span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-black/60 text-white border border-amber-500/40">
                    {unauthorizedWarning.plateNumber}
                  </span>
                </div>
                <p className="text-xs text-slate-200 mt-0.5 font-medium">
                  {unauthorizedWarning.message}
                </p>
              </div>
            </div>
            <button
              onClick={() => setUnauthorizedWarning(null)}
              className="text-xs font-bold text-slate-400 hover:text-white px-3 py-1 rounded bg-black/30 hover:bg-black/50 transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Metric Overview */}
        <div className="mt-6">
          <StatsOverview summary={summary} />
        </div>

        {/* Entry Welcome / Banner */}
        <NotificationBanner
          allocatedSlot={assignedBanner.slot}
          vehicleType={assignedBanner.vehicleType}
          plateNumber={assignedBanner.plateNumber}
          triggerBuzzer={assignedBanner.triggerBuzzer}
          onDismiss={() => setAssignedBanner({ slot: null, vehicleType: '', plateNumber: null, triggerBuzzer: false })}
        />

        {/* 2D Digital Twin Layout */}
        <div className="mt-6">
          <ParkingLayout slots={slots} onManualRelease={handleManualRelease} />
        </div>

        {/* Dual ESP32-CAM Camera Feeds with Servo Boom Barrier Indicators */}
        <div className="mt-6">
          <LiveCameraFeed
            entryDetection={entryDetection}
            exitDetection={exitDetection}
            diagnostics={diagnostics}
            apiBase={apiBase}
            loading={loading}
            onRefresh={() => {
              fetchParkingState();
              fetchDiagnostics();
            }}
          />
        </div>

        {/* Simulation Bench & Live Audit Log */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <LiveActivityLog events={events} />

          <DemoControls
            onSimulateEntry={handleSimulateEntry}
            onSimulateExit={handleSimulateExit}
            onResetDemo={handleResetDemo}
            onManualReleaseSlot={handleManualRelease}
            availableSlots={slots.filter((s) => s.status === 'AVAILABLE').map((s) => s.slot_number)}
            loading={loading}
          />
        </div>
      </main>

      {/* Exit Digital Receipt Modal */}
      {exitReceipt && (
        <ExitReceiptModal
          receipt={exitReceipt}
          onClose={() => setExitReceipt(null)}
        />
      )}
    </div>
  );
}
