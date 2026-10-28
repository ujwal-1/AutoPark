'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Navbar } from '../../components/Navbar';
import { ExitReceiptModal } from '../../components/ExitReceiptModal';
import {
  QrCode,
  Car,
  Clock,
  Compass,
  MapPin,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Zap,
  Navigation,
  RefreshCw,
  Calendar,
  IndianRupee,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { getApiBaseUrl, getWsUrl } from '../../lib/config';
import { ExitReceiptData } from '../../lib/types';

interface MyStatusData {
  user?: {
    id: number;
    username: string;
    full_name?: string;
    vehicle_plate?: string;
  };
  active_booking?: {
    id: number;
    plate_number: string;
    vehicle_type: string;
    status: string;
    created_at: string;
    expires_at: string;
    driver_name?: string;
    slot_number?: string;
  } | null;
  active_session?: {
    id: number;
    plate_number: string;
    vehicle_type: string;
    slot_number: string;
    entry_time: string;
    status: string;
  } | null;
  has_active_entry: boolean;
}

export default function PassPage() {
  const router = useRouter();
  const [statusData, setStatusData] = useState<MyStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  const [barrierAlert, setBarrierAlert] = useState<{
    gate: 'entry' | 'exit';
    action: string;
    slot?: string;
    plate?: string;
    message: string;
  } | null>(null);

  const [receiptData, setReceiptData] = useState<ExitReceiptData | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const storedToken = typeof window !== 'undefined' ? localStorage.getItem('autopark_token') : null;
    setToken(storedToken);

    // Failsafe timeout so loading state never hangs
    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 2500);

    if (!storedToken) {
      setLoading(false);
      return () => clearTimeout(safetyTimer);
    }

    fetchStatus(storedToken).finally(() => {
      clearTimeout(safetyTimer);
      setLoading(false);
    });

    return () => clearTimeout(safetyTimer);
  }, []);

  const fetchStatus = async (authToken: string) => {
    try {
      setLoading(true);
      setError(null);
      const base = getApiBaseUrl();
      const res = await fetch(`${base}/api/bookings/my-status`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem('autopark_token');
          setToken(null);
          setStatusData(null);
          setLoading(false);
          return;
        }
        throw new Error('Failed to load active pass status');
      }

      const data = await res.json();
      setStatusData(data);
    } catch (err: any) {
      setError(err.message || 'Error loading pass details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const wsUrl = getWsUrl();
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        // Every broadcast nests its payload under `data`.
        const data = msg.data ?? {};

        if (msg.type === 'barrier.entry') {
          setBarrierAlert({
            gate: 'entry',
            action: data.action || 'OPEN',
            slot: data.slot,
            plate: data.plate,
            message: `Entry Boom Barrier actuated to 90°! Gate open for ${data.plate ?? 'vehicle'}. Proceed to Slot ${data.slot ?? '—'}.`,
          });
          if (token) fetchStatus(token);
          setTimeout(() => setBarrierAlert(null), 10000);
        }

        if (msg.type === 'vehicle.exited' || msg.type === 'barrier.exit') {
          const plate = data.plate ?? data.plate_number;
          if (
            statusData?.active_session &&
            plate &&
            plate === statusData.active_session.plate_number
          ) {
            setReceiptData({
              slot: data.slot || statusData.active_session.slot_number,
              plateNumber: plate,
              durationFormatted: data.duration_formatted ?? data.duration ?? '—',
              billedAmount: data.billed_amount ?? null,
              exitTime: new Date().toLocaleTimeString(),
            });

            if (token) fetchStatus(token);
          }
        }
      } catch (e) {}
    };

    return () => ws.close();
  }, [token, statusData?.active_session, elapsedSeconds]);

  useEffect(() => {
    if (!statusData?.active_session?.entry_time) {
      setElapsedSeconds(0);
      return;
    }

    const entryDate = new Date(statusData.active_session.entry_time);
    const updateElapsed = () => {
      const now = new Date();
      const diffSecs = Math.max(0, Math.floor((now.getTime() - entryDate.getTime()) / 1000));
      setElapsedSeconds(diffSecs);
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [statusData?.active_session?.entry_time]);

  const formatElapsed = (totalSecs: number) => {
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return `${hours.toString().padStart(2, '0')}:${mins
      .toString()
      .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const calculateEstimatedFee = (secs: number) => {
    const hours = Math.ceil(secs / 3600) || 1;
    return 30 + Math.max(0, (hours - 1) * 20);
  };

  const handleCancelBooking = async () => {
    if (!statusData?.active_booking?.id || !token) return;
    if (!confirm('Are you sure you want to cancel this advance booking?')) return;

    setCancelling(true);
    try {
      const base = getApiBaseUrl();
      const res = await fetch(`${base}/api/bookings/${statusData.active_booking.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        await fetchStatus(token);
      } else {
        alert('Failed to cancel reservation');
      }
    } catch {
      alert('Error cancelling booking');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="min-h-screen bg-concrete text-ink flex flex-col selection:bg-ink selection:text-panel">
      <Navbar />

      {/* Real-time Servo Barrier Event Banner (Monochrome Style) */}
      {barrierAlert && (
        <div className="bg-panel border-b border-hair px-4 py-3 text-ink animate-fade-in sticky top-16 z-40">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-sm bg-ok opacity-75"></span>
                <span className="relative inline-flex rounded-sm h-3 w-3 bg-ok"></span>
              </span>
              <p className="text-xs sm:text-sm font-semibold tracking-wide flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-ink" />
                {barrierAlert.message}
              </p>
            </div>
            <button
              onClick={() => setBarrierAlert(null)}
              className="text-xs text-ink2 hover:text-ink underline font-bold"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 flex flex-col space-y-6">
        {/* District Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-hair">
          <div>
            <div className="flex items-center gap-2 text-ink2 text-xs font-bold uppercase tracking-wider mb-1">
              <ShieldCheck className="w-4 h-4 text-ink" />
              <span>Digital Smart Gate Credential</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-ink">
              Driver Active Parking Pass
            </h1>
            <p className="text-xs sm:text-sm text-ink2 mt-1">
              Real-time hardware clearance pass for entry & exit servo boom barriers.
            </p>
          </div>

          {token && (
            <button
              onClick={() => fetchStatus(token)}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-sm bg-panel border border-hair hover:border-ink text-ink2 hover:text-ink text-xs font-semibold transition-all self-start sm:self-auto"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-ink' : ''}`} />
              <span>Refresh Status</span>
            </button>
          )}
        </div>

        {/* Content Area */}
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 text-ink2 gap-3">
            <RefreshCw className="w-8 h-8 animate-spin text-ink" />
            <p className="text-sm font-medium">Verifying active pass credentials...</p>
          </div>
        ) : !token ? (
          /* Not Signed In State (District Monochrome Design) */
          <div className="flex-1 flex flex-col items-center justify-center py-16 text-center max-w-md mx-auto">
            <div className="w-16 h-16 rounded-sm bg-panel border border-hair flex items-center justify-center text-ink mb-6">
              <QrCode className="w-8 h-8 text-ink" />
            </div>
            <h2 className="text-xl font-bold text-ink mb-2">Sign in to Access Your Active Pass</h2>
            <p className="text-xs sm:text-sm text-ink2 mb-6 leading-relaxed">
              Your digital smart pass coordinates optical plate verification and automatically raises the SG90 boom barrier upon vehicle arrival.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 w-full">
              <Link
                href="/login"
                className="district-btn-primary flex-1 py-3 px-5 text-xs font-bold flex items-center justify-center gap-2"
              >
                <span>Sign In to Account</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <button
                onClick={() => {
                  setToken('demo_token');
                  setStatusData({
                    has_active_entry: false,
                    active_booking: {
                      id: 999,
                      plate_number: 'DL-01-AB-1234',
                      vehicle_type: 'Car',
                      status: 'CONFIRMED',
                      slot_number: 'A2',
                      created_at: new Date().toISOString(),
                      expires_at: new Date(Date.now() + 7200000).toISOString(),
                      driver_name: 'Evaluator Guest',
                    },
                    active_session: null,
                  });
                }}
                className="district-btn-secondary px-5 py-3 text-xs flex items-center justify-center font-semibold"
              >
                Preview Demo Pass
              </button>
              <Link
                href="/book"
                className="district-btn-secondary px-5 py-3 text-xs flex items-center justify-center"
              >
                Pre-Book Slot
              </Link>
            </div>
          </div>
        ) : statusData?.active_session ? (
          /* STATE 1: VEHICLE IS INSIDE & PARKED IN BAY (Monochrome Style) */
          <div className="space-y-6">
            <div className="district-card p-6 sm:p-8 bg-panel border border-hair">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-hair">
                <div className="flex items-center gap-3">
                  <span className="flex h-3 w-3 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-sm bg-ok opacity-75"></span>
                    <span className="relative inline-flex rounded-sm h-3 w-3 bg-ok"></span>
                  </span>
                  <span className="text-xs uppercase tracking-widest font-bold text-ok">
                    Active Parking Session in Progress
                  </span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 rounded-sm bg-panel2 border border-hair text-xs text-ink">
                  <Car className="w-3.5 h-3.5 text-ink2" />
                  <span className="font-mono font-bold tracking-wider">{statusData.active_session.plate_number}</span>
                </div>
              </div>

              {/* Bay Allocation Display */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-6 items-center">
                <div className="md:col-span-2 space-y-3">
                  <span className="text-xs font-bold uppercase text-ink2 tracking-wider">
                    Designated Parking Bay
                  </span>
                  <div className="flex items-baseline gap-4">
                    <span className="text-5xl sm:text-6xl font-semibold tracking-tight text-ink font-mono">
                      BAY {statusData.active_session.slot_number}
                    </span>
                    <span className="text-xs px-2.5 py-0.5 rounded-sm bg-ok/10 text-ok border border-ok/50 font-bold">
                      Vehicle Parked
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-ink2 flex items-center gap-2">
                    <Navigation className="w-4 h-4 text-ink" />
                    <span>
                      Zone {statusData.active_session.slot_number.startsWith('A') ? 'A (North Deck)' : 'B (South Deck)'} • Follow illuminated bay overhead lane markers.
                    </span>
                  </p>
                </div>

                {/* Live Ticking Parking Timer */}
                <div className="rounded-sm bg-concrete border border-hair p-5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between text-xs text-ink2 mb-1">
                      <span className="flex items-center gap-1.5 font-medium">
                        <Clock className="w-3.5 h-3.5 text-ink2" />
                        Elapsed Duration
                      </span>
                      <span className="text-[10px] text-ok font-mono">● Live</span>
                    </div>
                    <div className="text-3xl font-semibold font-mono tracking-tight text-ink">
                      {formatElapsed(elapsedSeconds)}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-hair flex items-center justify-between">
                    <span className="text-xs text-ink2">Accrued Parking Fee</span>
                    <span className="text-base font-bold text-ink flex items-center">
                      <IndianRupee className="w-3.5 h-3.5 mr-0.5" />
                      {calculateEstimatedFee(elapsedSeconds)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Wayfinding Instructions */}
              <div className="mt-6 rounded-sm bg-panel border border-hair p-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-ink mb-2 flex items-center gap-1.5">
                  <Compass className="w-4 h-4 text-ink2" />
                  Departure Clearance Procedure
                </h4>
                <p className="text-xs sm:text-sm text-ink2 leading-relaxed">
                  When ready to depart, drive vehicle directly toward the <strong className="text-ink">Exit Gate</strong>. The Exit ESP32-CAM will verify plate <span className="font-mono text-ink font-bold">{statusData.active_session.plate_number}</span>, calculate duration, and automatically signal the servo to raise the boom barrier to 90°.
                </p>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-sm bg-panel border border-hair">
              <div className="flex items-center gap-2 text-xs text-ink2">
                <Calendar className="w-4 h-4 text-ink2" />
                <span>Parked at: {new Date(statusData.active_session.entry_time).toLocaleTimeString()}</span>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  href="/operator"
                  className="inline-flex items-center gap-1.5 text-xs text-ink2 hover:text-ink font-semibold transition-colors"
                >
                  <span>View in Facility 2D Twin</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        ) : statusData?.active_booking ? (
          /* STATE 2: PRE-BOOKED PASS WAITING AT ENTRY GATE (Monochrome Ticket Design) */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 district-card p-6 sm:p-8 bg-panel border border-hair">
              <div className="flex items-center justify-between pb-5 border-b border-hair">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-ok"></div>
                  <span className="text-xs font-bold uppercase tracking-wider text-ink">
                    Confirmed Gate Pass • Clear to Enter
                  </span>
                </div>
                <span className="text-xs font-mono px-2.5 py-0.5 rounded-sm bg-panel2 text-ink2 border border-hair">
                  REF #{statusData.active_booking.id}
                </span>
              </div>

              <div className="my-6 space-y-5">
                {/* Reserved Parking Bay Showcase */}
                <div className="p-4 sm:p-5 rounded-sm bg-concrete border border-hair flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-ink2">
                      Reserved Parking Bay
                    </span>
                    <div className="flex items-baseline gap-3 mt-1">
                      <span className="text-4xl sm:text-5xl font-semibold font-mono tracking-tight text-ink">
                        BAY {statusData.active_booking.slot_number || 'A1'}
                      </span>
                      <span className="text-xs px-2.5 py-0.5 rounded-sm bg-ok/10 text-ok border border-ok/50 font-bold">
                        Guaranteed Hold
                      </span>
                    </div>
                    <p className="text-xs text-ink2 mt-1 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-ink2" />
                      <span>
                        {statusData.active_booking.slot_number?.startsWith('B') ? 'Zone B (South Deck)' : 'Zone A (North Deck)'} • Follow illuminated overhead indicators upon entry.
                      </span>
                    </p>
                  </div>

                  <div className="px-4 py-3 rounded-sm bg-panel border border-hair text-left sm:text-right sm:self-center">
                    <span className="text-[10px] uppercase font-bold text-ink2 block">Registered Plate</span>
                    <span className="text-base font-semibold font-mono tracking-wider text-ink">
                      {statusData.active_booking.plate_number}
                    </span>
                    <span className="text-[11px] text-ink2 block mt-0.5">
                      {statusData.active_booking.vehicle_type}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-3 border-t border-hair">
                  <div>
                    <span className="text-xs text-ink2">Pass Validity</span>
                    <p className="text-sm font-semibold text-ink mt-0.5">
                      {statusData.active_booking.expires_at
                        ? new Date(statusData.active_booking.expires_at).toLocaleTimeString()
                        : 'Within 2 Hours'}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-ink2">Gate Boom Barrier</span>
                    <p className="text-sm font-semibold text-ok flex items-center gap-1 mt-0.5">
                      <Zap className="w-3.5 h-3.5" />
                      Optical ANPR Armed (90°)
                    </p>
                  </div>
                </div>
              </div>

              {/* Hardware Clearance Notice */}
              <div className="rounded-sm bg-panel border border-hair p-4 text-xs text-ink2 space-y-2">
                <p className="font-semibold text-ink flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-ok" />
                  Automated Gate Clearance Protocol
                </p>
                <p className="leading-relaxed text-ink2">
                  As you reach the entrance, the <strong className="text-ink">ESP32-CAM optical sensor</strong> will scan your license plate (<span className="text-ink font-mono font-bold">{statusData.active_booking.plate_number}</span>). The barrier servo will automatically swing up to 90° for 5 seconds and route you directly to <strong className="text-ink">Bay {statusData.active_booking.slot_number || 'A1'}</strong>.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 pt-5 border-t border-hair flex items-center justify-between gap-4">
                <button
                  onClick={handleCancelBooking}
                  disabled={cancelling}
                  className="text-xs text-ink2 hover:text-ink font-semibold transition-colors"
                >
                  {cancelling ? 'Cancelling...' : 'Cancel Pre-Booking'}
                </button>
                <Link
                  href="/operator"
                  className="inline-flex items-center gap-1.5 text-xs text-ink hover:text-ink2 font-bold"
                >
                  <span>Monitor Entry Feed</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* QR Code / Digital Verification Visual */}
            <div className="district-card p-6 bg-panel border border-hair flex flex-col items-center justify-center text-center">
              <span className="text-xs uppercase font-bold text-ink2 tracking-wider mb-4">
                Digital Pass Hologram
              </span>

              <div className="p-4 rounded-sm bg-ink text-panel shadow-none flex flex-col items-center justify-center">
                <QrCode className="w-36 h-36" />
                <span className="text-[10px] font-mono font-bold tracking-widest mt-2 uppercase text-[#BCB6A7]">
                  AUTOPARK-{(statusData.active_booking.plate_number || 'VEHICLE').replace(/\s+/g, '')}
                </span>
              </div>

              <p className="text-xs text-ink2 mt-4 max-w-[200px] leading-relaxed">
                Optical camera scans plate directly. Present this QR only if manual verification is requested.
              </p>
            </div>
          </div>
        ) : (
          /* STATE 3: NO ACTIVE BOOKING OR PASS (Monochrome) */
          <div className="flex-1 flex flex-col items-center justify-center py-16 text-center max-w-lg mx-auto">
            <div className="district-squircle w-16 h-16 rounded-sm bg-panel border-hair text-ink mb-6">
              <Car className="w-8 h-8 text-ink" />
            </div>
            <h2 className="text-xl font-bold text-ink mb-2">No Active Parking Pass</h2>
            <p className="text-xs sm:text-sm text-ink2 mb-6 leading-relaxed">
              You do not currently have a reserved slot or active parking session. To enter the facility through the automated servo gate, reserve a slot in advance.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
              <button
                onClick={() => {
                  setStatusData({
                    has_active_entry: false,
                    active_booking: {
                      id: 999,
                      plate_number: 'DL-01-AB-1234',
                      vehicle_type: 'Car',
                      status: 'CONFIRMED',
                      created_at: new Date().toISOString(),
                      expires_at: new Date(Date.now() + 7200000).toISOString(),
                      driver_name: 'Evaluator Guest',
                    },
                    active_session: null,
                  });
                }}
                className="district-btn-secondary px-5 py-3 text-xs flex items-center justify-center font-semibold"
              >
                Preview Demo Pass
              </button>
              <Link
                href="/book"
                className="district-btn-primary py-3 px-6 text-xs font-bold flex items-center justify-center gap-2"
              >
                <span>Reserve a Slot Now</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/history"
                className="district-btn-secondary px-5 py-3 text-xs flex items-center justify-center"
              >
                Past Receipts
              </Link>
            </div>
          </div>
        )}
      </main>

      {/* Exit Digital Receipt Modal */}
      {receiptData && (
        <ExitReceiptModal
          receipt={receiptData}
          onClose={() => setReceiptData(null)}
        />
      )}
    </div>
  );
}
