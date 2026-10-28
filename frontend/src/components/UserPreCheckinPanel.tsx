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
    } catch (err) {
      console.error('Cancel booking error:', err);
    } finally {
      setCancelling(false);
    }
  };

  // Not logged in view
  if (!currentUser) {
    return (
      <div className="bg-[#333545] border border-amber-500/40 rounded-2xl p-5 mb-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 shrink-0 mt-0.5">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Pre-Entry Driver Authentication Required
              </h2>
              <p className="text-xs text-gray-300 mt-1 max-w-2xl leading-relaxed">
                Our camera gate operates on a <strong className="text-white">Pre-Check-In system</strong>. Drivers must log in and register their license plate on this dashboard <strong className="text-amber-300">before</strong> arriving at the entry barrier. Unregistered vehicles will be denied entry.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/login"
              className="px-4 py-2 rounded-xl text-xs font-bold bg-[#F84464] hover:bg-[#e03a58] text-white shadow-lg shadow-[#F84464]/25 transition-all flex items-center gap-1.5"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In to Check-In</span>
            </Link>
            <Link
              href="/register"
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#222531] hover:bg-gray-700/60 text-gray-200 border border-gray-600 transition-all"
            >
              <span>Register</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const activeBooking = myStatus?.active_booking;
  const activeSession = myStatus?.active_session;

  return (
    <div className="bg-[#333545] border border-gray-700/60 rounded-2xl p-5 mb-6 shadow-xl">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-gray-700/60">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#F84464]/20 border border-[#F84464]/40 text-[#F84464] rounded-xl">
            <Car className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              Vehicle Pre-Check-In Portal
              <span className="text-[10px] px-2 py-0.5 rounded font-extrabold uppercase tracking-wider bg-[#2DC492]/20 text-[#2DC492] border border-[#2DC492]/30">
                ACTIVE DRIVER
              </span>
            </h2>
            <p className="text-xs text-gray-300">
              Welcome back, <span className="text-white font-semibold">{currentUser.full_name || currentUser.username}</span>. Register your vehicle before approaching the camera gate.
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowHistory(!showHistory)}
          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-[#222531] border border-gray-600/70 text-gray-300 hover:text-white hover:border-gray-500 transition-all flex items-center gap-1.5 self-start lg:self-auto"
        >
          <History className="w-3.5 h-3.5 text-[#F84464]" />
          <span>{showHistory ? 'Hide History' : 'My Parking History'}</span>
        </button>
      </div>

      {/* Status Alerts */}
      {error && (
        <div className="mt-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-medium flex items-center gap-2">
          <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="mt-4 p-3 rounded-xl bg-[#2DC492]/15 border border-[#2DC492]/40 text-[#2DC492] text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Main Content Grid: Live Status + Pre-Check-in Form */}
      <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Current Active Clearance Card */}
        <div className="lg:col-span-5 flex flex-col justify-between p-4 rounded-xl bg-[#222531] border border-gray-700/60">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400">
              Current Clearance Status
            </span>

            {activeSession ? (
              <div className="mt-3">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Vehicle Actively Parked</span>
                </div>
                <div className="mt-3 bg-[#333545] p-3 rounded-xl border border-emerald-500/30">
                  <div className="flex items-center justify-between text-xs text-gray-300 mb-1.5">
                    <span>Assigned Slot:</span>
                    <span className="font-black text-lg text-emerald-400">
                      {activeSession.slot_number || 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-300 mb-1">
                    <span>License Plate:</span>
                    <span className="font-mono font-bold text-white bg-black/40 px-2 py-0.5 rounded">
                      {activeSession.plate_number || 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-400 mt-2 pt-2 border-t border-gray-700">
                    <span>Entry Time:</span>
                    <span>{activeSession.entry_time ? new Date(activeSession.entry_time).toLocaleTimeString() : 'Recent'}</span>
                  </div>
                </div>
              </div>
            ) : activeBooking ? (
              <div className="mt-3">
                <div className="flex items-center gap-2 text-[#2DC492] font-bold text-sm">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#2DC492] animate-ping" />
                  <span>Pre-Cleared: Drive to Entry Gate!</span>
                </div>
                <div className="mt-3 bg-[#333545] p-3 rounded-xl border border-[#2DC492]/40 shadow-inner">
                  <div className="flex items-center justify-between text-xs text-gray-300 mb-1.5">
                    <span>Authorized Plate:</span>
                    <span className="font-mono font-bold text-base text-white bg-black/50 px-2 py-0.5 rounded border border-[#2DC492]/40">
                      {activeBooking.plate_number}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-300 mb-1">
                    <span>Vehicle:</span>
                    <span className="font-semibold text-gray-200 capitalize">{activeBooking.vehicle_type}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-amber-300 mt-2 pt-2 border-t border-gray-700">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>Valid until:</span>
                    </span>
                    <span>
                      {activeBooking.expires_at ? new Date(activeBooking.expires_at).toLocaleTimeString() : '2 hours'}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleCancelBooking(activeBooking.id)}
                  disabled={cancelling}
                  className="mt-3 text-xs text-gray-400 hover:text-rose-400 flex items-center gap-1 font-semibold transition-colors disabled:opacity-50"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>{cancelling ? 'Cancelling...' : 'Cancel Pre-Check-In'}</span>
                </button>
              </div>
            ) : (
              <div className="mt-3 py-4 text-center">
                <div className="inline-flex p-3 rounded-full bg-gray-700/40 text-gray-400 mb-2">
                  <Car className="w-6 h-6" />
                </div>
                <p className="text-xs text-gray-300 font-medium">
                  No vehicle currently pre-registered.
                </p>
                <p className="text-[11px] text-gray-400 mt-1">
                  Fill out the form to obtain entry gate clearance before arrival.
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-gray-700/60 text-[11px] text-gray-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>YOLOv11 & EasyOCR will automatically open the gate for pre-registered plates.</span>
          </div>
        </div>

        {/* Right: Pre-Check-in Submission Form */}
        <div className="lg:col-span-7 p-4 rounded-xl bg-[#222531] border border-gray-700/60">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 block mb-3">
            {activeBooking ? 'Update Pre-Check-In Vehicle' : 'New Pre-Check-In Submission'}
          </span>

          <form onSubmit={handlePreCheckin} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-gray-300 mb-1">
                License Plate Number <span className="text-[#F84464]">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  value={plateNumber}
                  onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
                  placeholder="e.g. KA05KK0403 or MH12AB1234"
                  className="flex-1 px-3.5 py-2 rounded-xl bg-[#333545] border border-gray-700 text-sm font-mono font-bold text-white uppercase placeholder-gray-500 focus:outline-none focus:border-[#F84464] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setPlateNumber('KA05KK0403')}
                  className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
                  title="Quick fill sample demo vehicle plate"
                >
                  Demo Plate
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">
                  Vehicle Type
                </label>
                <select
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#333545] border border-gray-700 text-xs font-semibold text-white focus:outline-none focus:border-[#F84464] transition-colors"
                >
                  <option value="Car">Car</option>
                  <option value="SUV">SUV</option>
                  <option value="Sedan">Sedan</option>
                  <option value="Motorcycle">Motorcycle</option>
                  <option value="Toy Car">Toy / Demo RC Car</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">
                  Arrival Window
                </label>
                <select
                  value={durationHours}
                  onChange={(e) => setDurationHours(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-[#333545] border border-gray-700 text-xs font-semibold text-white focus:outline-none focus:border-[#F84464] transition-colors"
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
              className="w-full mt-2 py-2.5 px-4 rounded-xl font-bold text-xs bg-[#F84464] hover:bg-[#e03a58] active:scale-[0.99] text-white shadow-md shadow-[#F84464]/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
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
        <div className="mt-5 pt-4 border-t border-gray-700/60">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-gray-300 flex items-center gap-1.5 uppercase tracking-wider">
              <History className="w-3.5 h-3.5 text-[#F84464]" />
              <span>Your Parking History (Last 20 Sessions)</span>
            </h3>
            <span className="text-[10px] text-gray-400 font-semibold">{history.length} records found</span>
          </div>

          {history.length === 0 ? (
            <p className="text-xs text-gray-400 py-3 text-center">
              No historical parking sessions found for this account.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-300">
                <thead className="text-[10px] uppercase font-bold text-gray-400 border-b border-gray-700">
                  <tr>
                    <th className="py-2 px-2">Plate</th>
                    <th className="py-2 px-2">Vehicle</th>
                    <th className="py-2 px-2">Slot</th>
                    <th className="py-2 px-2">Entry Time</th>
                    <th className="py-2 px-2">Exit Time</th>
                    <th className="py-2 px-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/40 font-medium">
                  {history.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-700/20">
                      <td className="py-2 px-2 font-mono font-bold text-white">
                        {item.plate_number || 'N/A'}
                      </td>
                      <td className="py-2 px-2 capitalize">{item.vehicle_type}</td>
                      <td className="py-2 px-2 font-bold text-emerald-400">{item.slot_number || 'N/A'}</td>
                      <td className="py-2 px-2 text-gray-400">
                        {item.entry_time ? new Date(item.entry_time).toLocaleString() : 'N/A'}
                      </td>
                      <td className="py-2 px-2 text-gray-400">
                        {item.exit_time ? new Date(item.exit_time).toLocaleString() : 'In Progress'}
                      </td>
                      <td className="py-2 px-2">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-extrabold uppercase ${
                            item.status === 'COMPLETED'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
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
