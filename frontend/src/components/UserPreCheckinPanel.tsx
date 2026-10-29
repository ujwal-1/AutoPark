'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Car,
  CheckCircle2,
  Clock,
  ShieldCheck,
  AlertTriangle,
  History,
  XCircle,
  LogIn,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { UserProfile, MyStatusData, ParkingHistoryData } from '../lib/types';
import { getApiBaseUrl } from '../lib/config';

interface UserPreCheckinPanelProps {
  currentUser: UserProfile | null;
  myStatus: MyStatusData | null;
  history: ParkingHistoryData[];
  onCheckinSuccess: () => void;
  apiBase?: string;
}

export const UserPreCheckinPanel: React.FC<UserPreCheckinPanelProps> = ({
  currentUser,
  myStatus,
  history,
  onCheckinSuccess,
  apiBase,
}) => {
  const effectiveApiBase = apiBase || getApiBaseUrl();
  const [plateNumber, setPlateNumber] = useState('');
  const [vehicleType, setVehicleType] = useState('Car');
  const [durationHours, setDurationHours] = useState(2);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const handlePreCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const token = localStorage.getItem('autopark_token');
    if (!token) {
      setError('Please log in first to submit pre-check-in.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${effectiveApiBase}/api/bookings/pre-checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          plate_number: plateNumber.trim().toUpperCase(),
          vehicle_type: vehicleType,
          duration_hours: durationHours,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Pre-check-in failed');
      }

      setSuccessMsg(`Gate Clearance Granted for [${data.plate_number}]! You may now drive to the entry gate.`);
      setPlateNumber('');
      onCheckinSuccess();
    } catch (err: any) {
      setError(err.message || 'Error creating pre-check-in');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelBooking = async (bookingId: number) => {
    const token = localStorage.getItem('autopark_token');
    if (!token) return;

    setCancelling(true);
    try {
      const res = await fetch(`${effectiveApiBase}/api/bookings/${bookingId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        onCheckinSuccess();
      }
    } catch (_err) {
      // silently handled — booking state will be stale until next refresh
    } finally {
      setCancelling(false);
    }
  };

  // Not logged in view
  if (!currentUser) {
    return (
      <div className="card p-5 mb-6 border border-hair">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-sm bg-paint/20 border border-paintDeep/40 text-paintDeep shrink-0 mt-0.5">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink flex items-center gap-2">
                Pre-Entry Driver Authentication Required
              </h2>
              <p className="text-xs text-ink2 mt-1 max-w-2xl leading-relaxed">
                Our camera gate operates on a <strong className="text-ink">Pre-Check-In system</strong>. Drivers must log in
                and register their license plate on this dashboard{' '}
                <strong className="text-paintDeep">before</strong> arriving at the entry barrier.
                Unregistered vehicles will be denied entry.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/login"
              className="district-btn-primary px-4 py-2 text-xs font-bold flex items-center gap-1.5"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In to Check-In</span>
            </Link>
            <Link
              href="/register"
              className="district-btn-secondary px-3.5 py-2 text-xs font-bold flex items-center"
            >
              Register
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const activeBooking = myStatus?.active_booking;
  const activeSession = myStatus?.active_session;

  return (
    <div className="card mb-6 border border-hair">
      {/* Card Header */}
      <div className="card-head flex-col lg:flex-row lg:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-panel2 border border-hair text-ink rounded-sm">
            <Car className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-ink flex items-center gap-2">
              Vehicle Pre-Check-In Portal
              <span className="text-[10px] px-2 py-0.5 rounded-sm font-bold uppercase tracking-wider bg-ok/10 text-ok border border-ok/30">
                Active Driver
              </span>
            </h2>
            <p className="text-xs text-ink2 mt-0.5">
              Welcome back,{' '}
              <span className="text-ink font-semibold">{currentUser.full_name || currentUser.username}</span>.
              Register your vehicle before approaching the camera gate.
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowHistory(!showHistory)}
          className="btn text-xs flex items-center gap-1.5 self-start lg:self-auto ml-auto"
        >
          <History className="w-3.5 h-3.5 text-paintDeep" />
          <span>{showHistory ? 'Hide History' : 'My Parking History'}</span>
        </button>
      </div>

      {/* Status Alerts */}
      {error && (
        <div className="mx-4 mt-4 p-3 rounded-sm bg-fault/10 border border-fault text-fault text-xs font-medium flex items-center gap-2">
          <XCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="mx-4 mt-4 p-3 rounded-sm bg-ok/10 border border-ok/40 text-ok text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Current Active Clearance */}
        <div className="lg:col-span-5 flex flex-col justify-between p-4 rounded-sm bg-panel2 border border-hair">
          <div>
            <span className="kicker">Current Clearance Status</span>

            {activeSession ? (
              <div className="mt-3">
                <div className="flex items-center gap-2 text-ok font-bold text-sm">
                  <span className="w-2.5 h-2.5 rounded-full bg-ok animate-pulse" />
                  <span>Vehicle Actively Parked</span>
                </div>
                <div className="mt-3 bg-panel border border-ok/30 p-3 rounded-sm">
                  <div className="flex items-center justify-between text-xs text-ink2 mb-1.5">
                    <span>Assigned Slot:</span>
                    <span className="font-black text-lg text-ok font-mono">
                      {activeSession.slot_number || 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-ink2 mb-1">
                    <span>License Plate:</span>
                    <span className="font-mono font-bold text-ink bg-panel2 px-2 py-0.5 rounded-sm border border-hair">
                      {activeSession.plate_number || 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted mt-2 pt-2 border-t border-hair">
                    <span>Entry Time:</span>
                    <span>{activeSession.entry_time ? new Date(activeSession.entry_time).toLocaleTimeString() : 'Recent'}</span>
                  </div>
                </div>
              </div>
            ) : activeBooking ? (
              <div className="mt-3">
                <div className="flex items-center gap-2 text-ok font-bold text-sm">
                  <span className="w-2.5 h-2.5 rounded-full bg-ok animate-ping" />
                  <span>Pre-Cleared: Drive to Entry Gate!</span>
                </div>
                <div className="mt-3 bg-panel border border-ok/30 p-3 rounded-sm">
                  <div className="flex items-center justify-between text-xs text-ink2 mb-1.5">
                    <span>Authorized Plate:</span>
                    <span className="font-mono font-bold text-sm text-ink bg-panel2 px-2 py-0.5 rounded-sm border border-hair">
                      {activeBooking.plate_number}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-ink2 mb-1">
                    <span>Vehicle:</span>
                    <span className="font-semibold text-ink capitalize">{activeBooking.vehicle_type}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-paintDeep mt-2 pt-2 border-t border-hair">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>Valid until:</span>
                    </span>
                    <span>
                      {activeBooking.expires_at
                        ? new Date(activeBooking.expires_at).toLocaleTimeString()
                        : '2 hours'}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleCancelBooking(activeBooking.id)}
                  disabled={cancelling}
                  className="mt-3 text-xs text-ink2 hover:text-fault flex items-center gap-1 font-semibold transition-colors disabled:opacity-50"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>{cancelling ? 'Cancelling...' : 'Cancel Pre-Check-In'}</span>
                </button>
              </div>
            ) : (
              <div className="mt-3 py-4 text-center">
                <div className="inline-flex p-3 rounded-sm bg-panel border border-hair text-muted mb-2">
                  <Car className="w-6 h-6" />
                </div>
                <p className="text-xs text-ink2 font-medium">No vehicle currently pre-registered.</p>
                <p className="text-xs text-muted mt-1">
                  Fill out the form to obtain entry gate clearance before arrival.
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-hair text-xs text-muted flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-paintDeep shrink-0" />
            <span>YOLOv11 &amp; EasyOCR will automatically open the gate for pre-registered plates.</span>
          </div>
        </div>

        {/* Right: Pre-Check-in Submission Form */}
        <div className="lg:col-span-7 p-4 rounded-sm bg-panel2 border border-hair">
          <span className="kicker block mb-3">
            {activeBooking ? 'Update Pre-Check-In Vehicle' : 'New Pre-Check-In Submission'}
          </span>

          <form onSubmit={handlePreCheckin} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-ink2 uppercase tracking-wider mb-1">
                License Plate Number <span className="text-fault">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  value={plateNumber}
                  onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
                  placeholder="e.g. KA05KK0403 or MH12AB1234"
                  className="flex-1 px-3.5 py-2 rounded-sm bg-panel border border-hair text-sm font-mono font-bold text-ink uppercase placeholder-muted focus:outline-none focus:border-ink transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setPlateNumber('KA05KK0403')}
                  className="btn text-xs px-2.5"
                  title="Quick fill sample demo vehicle plate"
                >
                  Demo
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-ink2 uppercase tracking-wider mb-1">
                  Vehicle Type
                </label>
                <select
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value)}
                  className="w-full px-3 py-2 rounded-sm bg-panel border border-hair text-xs font-semibold text-ink focus:outline-none focus:border-ink transition-colors"
                >
                  <option value="Car">Car</option>
                  <option value="SUV">SUV</option>
                  <option value="Sedan">Sedan</option>
                  <option value="Motorcycle">Motorcycle</option>
                  <option value="Toy Car">Toy / Demo RC Car</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink2 uppercase tracking-wider mb-1">
                  Arrival Window
                </label>
                <select
                  value={durationHours}
                  onChange={(e) => setDurationHours(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-sm bg-panel border border-hair text-xs font-semibold text-ink focus:outline-none focus:border-ink transition-colors"
                >
                  <option value={1}>1 hour</option>
                  <option value={2}>2 hours (Standard)</option>
                  <option value={4}>4 hours</option>
                  <option value={8}>8 hours</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !plateNumber.trim()}
              className="district-btn-primary w-full mt-2 py-2.5 px-4 font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <span>Registering Clearance...</span>
              ) : (
                <>
                  <span>{activeBooking ? 'Update Gate Clearance Pass' : 'Authorize Vehicle for Gate Entry'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* History Drawer */}
      {showHistory && (
        <div className="mx-4 mb-4 pt-4 border-t border-hair">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-ink flex items-center gap-1.5 uppercase tracking-wider">
              <History className="w-3.5 h-3.5 text-paintDeep" />
              <span>Your Parking History (Last 20 Sessions)</span>
            </h3>
            <span className="text-xs text-muted font-semibold">{history.length} records found</span>
          </div>

          {history.length === 0 ? (
            <p className="text-xs text-muted py-3 text-center">
              No historical parking sessions found for this account.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Plate</th>
                    <th>Vehicle</th>
                    <th>Slot</th>
                    <th>Entry Time</th>
                    <th>Exit Time</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item) => (
                    <tr key={item.id} className="hover:bg-panel2 transition-colors">
                      <td className="font-mono font-bold text-ink">{item.plate_number || 'N/A'}</td>
                      <td className="capitalize text-ink2">{item.vehicle_type}</td>
                      <td className="font-bold text-ok">{item.slot_number || 'N/A'}</td>
                      <td className="text-ink2">
                        {item.entry_time ? new Date(item.entry_time).toLocaleString() : 'N/A'}
                      </td>
                      <td className="text-ink2">
                        {item.exit_time ? new Date(item.exit_time).toLocaleString() : 'In Progress'}
                      </td>
                      <td>
                        <span
                          className={`pill ${
                            item.status === 'COMPLETED' ? 'pill-ok' : 'pill-reserved'
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
