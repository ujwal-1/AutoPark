'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Navbar } from '../../components/Navbar';
import { NotificationBanner } from '../../components/NotificationBanner';
import { ParkingLayout } from '../../components/ParkingLayout';
import { LiveCameraFeed } from '../../components/LiveCameraFeed';
import { LiveActivityLog } from '../../components/LiveActivityLog';
import { DemoControls } from '../../components/DemoControls';
import { ExitReceiptModal } from '../../components/ExitReceiptModal';
import { SessionsTable } from '../../components/SessionsTable';
import { LastReceiptPanel } from '../../components/LastReceiptPanel';
import { TelemetryPanel } from '../../components/TelemetryPanel';
import {
  ParkingSlotData,
  ActivityEvent,
  CameraDetectionState,
  CameraOnlineStatus,
  DiagnosticEvent,
  ExitReceiptData,
} from '../../lib/types';
import { getApiBaseUrl, getWsUrl } from '../../lib/config';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function OperatorPage() {
  const [slots, setSlots] = useState<ParkingSlotData[]>([]);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [systemOnline, setSystemOnline] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticEvent[]>([]);
  const [exitReceipt, setExitReceipt] = useState<ExitReceiptData | null>(null);
  const [lastReceipt, setLastReceipt] = useState<ExitReceiptData | null>(null);

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
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }),
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

  // Fetch live bay state from the backend
  const fetchParkingState = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/parking/slots`);
      if (res.ok) {
        const data = await res.json();
        setSlots(Array.isArray(data) ? data : []);
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
              `Entry — ${vehicle.toLowerCase()} ${data.plate_number || 'detected'} · bay ${data.slot}`,
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
              message: `Plate matched an open booking. Barrier lifted for bay ${data.slot}.`,
              camera_online_status: 'ONLINE',
              last_frame_timestamp: Date.now(),
            }));
          } else if (type === 'slot.released') {
            exitLastSeenRef.current = Date.now();
            fetchParkingState();
            addEventLog(`Bay ${data.slot} released`, 'released', data.slot);
          } else if (type === 'barrier.entry') {
            entryLastSeenRef.current = Date.now();
            addEventLog(
              `Entry barrier up · ${data.plate ?? 'vehicle'} · bay ${data.slot ?? '—'}`,
              'barrier',
              data.slot,
              data.plate
            );
          } else if (type === 'vehicle.exited') {
            exitLastSeenRef.current = Date.now();
            fetchParkingState();
            addEventLog(
              `Exit — ${data.plate_number || 'vehicle'} left bay ${data.slot ?? '—'}`,
              'exited',
              data.slot,
              data.plate_number
            );

            setExitDetection((prev) => ({
              ...prev,
              slot: data.slot ?? null,
              status: 'RELEASED',
              confidence: null,
              plate_number: data.plate_number ?? null,
              message: 'Session closed, bay freed and receipt issued.',
              camera_online_status: 'ONLINE',
              last_frame_timestamp: Date.now(),
            }));

            const receipt: ExitReceiptData = {
              slot: data.slot ?? '—',
              plateNumber: data.plate_number ?? '—',
              durationFormatted: data.duration_formatted ?? '—',
              billedAmount: data.billed_amount ?? null,
              exitTime: new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              }),
            };
            setExitReceipt(receipt);
            setLastReceipt(receipt);
          } else if (type === 'barrier.exit') {
            exitLastSeenRef.current = Date.now();
            addEventLog(
              `Exit barrier up · ${data.plate ?? 'vehicle'}${
                data.billed_amount != null ? ` · ₹${data.billed_amount}` : ''
              }`,
              'barrier',
              data.slot,
              data.plate
            );
          } else if (type === 'entry.unauthorized') {
            entryLastSeenRef.current = Date.now();
            addEventLog(
              `Entry refused — ${data.plate_number || 'unknown plate'} · no open booking`,
              'unauthorized',
              undefined,
              data.plate_number
            );

            setUnauthorizedWarning({
              plateNumber: data.plate_number || 'UNKNOWN',
              message: data.message || 'No open booking matches this plate. Barrier stayed down.',
            });

            setEntryDetection((prev) => ({
              ...prev,
              plate_number: data.plate_number,
              status: 'UNAUTHORIZED',
              confidence: data.confidence ?? null,
              message: 'No open booking matches this plate.',
              camera_online_status: 'ONLINE',
              last_frame_timestamp: Date.now(),
            }));
          } else if (type === 'parking.full') {
            addEventLog('Facility full — all 6 bays occupied', 'full');
          } else if (type === 'demo.reset' || type === 'parking.reset') {
            setAssignedBanner({ slot: null, vehicleType: '', plateNumber: null, triggerBuzzer: false });
            setUnauthorizedWarning(null);
            setExitReceipt(null);
            setLastReceipt(null);
            fetchParkingState();
            fetchDiagnostics();
            addEventLog('Facility reset — all bays available', 'reset');
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
        addEventLog(`Bay ${slotNumber} released by operator`, 'released', slotNumber);
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
    if (!confirm('Reset all 6 bays and clear active sessions?')) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/parking/reset`, { method: 'POST' });
      if (res.ok) {
        fetchParkingState();
        fetchDiagnostics();
        setAssignedBanner({ slot: null, vehicleType: '', plateNumber: null, triggerBuzzer: false });
        setUnauthorizedWarning(null);
        setLastReceipt(null);
      }
    } catch {
      alert('Error resetting demo');
    } finally {
      setLoading(false);
    }
  };

  const goToGates = () => {
    document.getElementById('gates')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen bg-concrete text-ink flex flex-col">
      <Navbar wsConnected={wsConnected} />

      <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-6 pb-9">
        {/* Page head — title, subtitle inline, live stamp on the right */}
        <div className="flex flex-wrap items-end gap-x-[18px] gap-y-2 pt-5 pb-3.5">
          <h1 className="font-sign font-bold text-[26px] leading-[1.1] tracking-[-0.022em]">
            Operator console
          </h1>
          <div className="text-[12.5px] text-ink2 pb-[3px]">
            Live facility state and gate controls
          </div>
          <div className="ml-auto mono text-[10px] uppercase tracking-[0.1em] text-ink2 border border-hair2 bg-panel px-[9px] py-[5px]">
            Live · Sanjay Nagar
          </div>
        </div>

        {!systemOnline && (
          <div className="mb-4 flex items-start gap-2.5 border border-fault bg-[#F6E7E2] px-3.5 py-2.5">
            <AlertTriangle className="w-4 h-4 text-fault mt-0.5 shrink-0" />
            <p className="text-[12px] text-ink">
              Can&apos;t reach the backend at <span className="mono">{apiBase}</span>. Retrying
              every 4&nbsp;s.
            </p>
            <button
              onClick={() => {
                fetchParkingState();
                fetchDiagnostics();
              }}
              className="btn ml-auto shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        {unauthorizedWarning && (
          <NotificationBanner
            label="Attention"
            onReview={goToGates}
            onDismiss={() => setUnauthorizedWarning(null)}
          >
            <b className="font-semibold">Entry refused</b> —{' '}
            <span className="mono">{unauthorizedWarning.plateNumber}</span> has no open booking.
            <span className="text-ink2"> Barrier stayed down.</span>
          </NotificationBanner>
        )}

        {assignedBanner.slot && (
          <NotificationBanner label="Entry" onDismiss={() => setAssignedBanner({ ...assignedBanner, slot: null })}>
            <b className="font-semibold">Bay {assignedBanner.slot}</b> assigned
            {assignedBanner.plateNumber ? (
              <>
                {' '}
                · <span className="mono">{assignedBanner.plateNumber}</span>
              </>
            ) : null}
            <span className="text-ink2">
              {' '}
              · {(assignedBanner.vehicleType || 'vehicle').replace('_', ' ')} · barrier up
            </span>
          </NotificationBanner>
        )}

        <ParkingLayout
          slots={slots}
          entryBarrierOpen={entryDetection.status === 'ALLOCATED'}
          exitBarrierOpen={exitDetection.status === 'RELEASED'}
          loading={loading}
        />

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-[minmax(0,1.62fr)_minmax(0,1fr)] gap-4 items-start">
          <div className="grid gap-4 min-w-0">
            <SessionsTable slots={slots} onRelease={handleManualRelease} />
            <LiveActivityLog events={events} />
          </div>

          <div className="grid gap-4 min-w-0">
            <div id="gates" className="scroll-mt-16">
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

            <LastReceiptPanel
              receipt={lastReceipt}
              onOpen={() => lastReceipt && setExitReceipt(lastReceipt)}
            />

            <TelemetryPanel />

            <DemoControls
              onSimulateEntry={handleSimulateEntry}
              onSimulateExit={handleSimulateExit}
              onResetDemo={handleResetDemo}
              onManualReleaseSlot={handleManualRelease}
              availableSlots={slots.filter((s) => s.status === 'AVAILABLE').map((s) => s.slot_number)}
              loading={loading}
            />
          </div>
        </div>

        <footer className="mt-4 flex flex-wrap items-center gap-4 pt-2.5 border-t border-hair2 text-[11px] text-muted">
          <span className="kicker">Build</span>
          <span>main · demo database</span>
          <span className="ml-auto flex items-center gap-4">
            <span>
              <span className="kicker">Bays</span> {slots.length || 6}
            </span>
            <span>
              <span className="kicker">Gates</span> 2
            </span>
            <span className="mono">{wsConnected ? 'websocket' : 'http polling'}</span>
          </span>
        </footer>
      </main>

      {exitReceipt && (
        <ExitReceiptModal receipt={exitReceipt} onClose={() => setExitReceipt(null)} />
      )}
    </div>
  );
}
