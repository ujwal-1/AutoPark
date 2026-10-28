'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Navbar } from '../../components/Navbar';
import { ExitReceiptModal } from '../../components/ExitReceiptModal';
import {
  History,
  Car,
  Calendar,
  Clock,
  IndianRupee,
  Receipt,
  Download,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Search,
  CheckCircle2,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { getApiBaseUrl } from '../../lib/config';
import { ExitReceiptData } from '../../lib/types';

interface ParkingSessionRecord {
  id: number;
  vehicle_type: string;
  plate_number: string;
  slot_number: string;
  entry_time: string | null;
  exit_time: string | null;
  status: string;
  booking_id?: number | null;
}

export default function HistoryPage() {
  const [sessions, setSessions] = useState<ParkingSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<ExitReceiptData | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const storedToken = typeof window !== 'undefined' ? localStorage.getItem('autopark_token') : null;
    setToken(storedToken);

    if (!storedToken) {
      setLoading(false);
      return;
    }

    fetchHistory(storedToken);
  }, []);

  const fetchHistory = async (authToken: string) => {
    try {
      setLoading(true);
      setError(null);
      const base = getApiBaseUrl();
      const res = await fetch(`${base}/api/bookings/my-history`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem('autopark_token');
          setToken(null);
          return;
        }
        throw new Error('Could not fetch parking records');
      }

      const data = await res.json();
      // Backend returns { history: [...] }; tolerate a bare array too.
      const records: ParkingSessionRecord[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.history)
        ? data.history
        : [];
      setSessions(records);
    } catch (err: any) {
      setError(err.message || 'Error loading history');
    } finally {
      setLoading(false);
    }
  };

  const calculateDurationMinutes = (entry: string | null, exit: string | null) => {
    if (!entry) return 1;
    const start = new Date(entry).getTime();
    // No exit yet -> live session, count up to "now" instead of faking a duration.
    const end = exit ? new Date(exit).getTime() : Date.now();
    return Math.max(1, Math.round((end - start) / (1000 * 60)));
  };

  const calculateFee = (mins: number) => {
    const hours = Math.ceil(mins / 60) || 1;
    return 30 + Math.max(0, (hours - 1) * 20);
  };

  const openReceipt = (session: ParkingSessionRecord) => {
    const isActive = session.status === 'ACTIVE' || !session.exit_time;
    const duration = calculateDurationMinutes(session.entry_time, session.exit_time);
    const amount = calculateFee(duration);
    setSelectedReceipt({
      slot: session.slot_number,
      plateNumber: session.plate_number,
      durationFormatted: `${duration} mins`,
      billedAmount: amount,
      exitTime: session.exit_time ? new Date(session.exit_time).toLocaleTimeString() : '—',
      active: isActive,
      entryTime: session.entry_time ? new Date(session.entry_time).toLocaleString() : undefined,
    });
  };

  const filteredSessions = sessions.filter((s) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (s.plate_number || '').toLowerCase().includes(q) ||
      (s.slot_number || '').toLowerCase().includes(q) ||
      (s.status || '').toLowerCase().includes(q)
    );
  });

  // Only completed sessions have actually been paid for.
  const totalSpent = sessions
    .filter((s) => s.status !== 'ACTIVE' && !!s.exit_time)
    .reduce((acc, s) => {
      const dur = calculateDurationMinutes(s.entry_time, s.exit_time);
      return acc + calculateFee(dur);
    }, 0);

  return (
    <div className="min-h-screen bg-districtBg text-white flex flex-col selection:bg-white/20 selection:text-white">
      <Navbar />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 flex flex-col space-y-6">
        {/* District Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/[0.08]">
          <div>
            <div className="flex items-center gap-2 text-zinc-400 text-xs font-bold tracking-wider uppercase mb-1">
              <Sparkles className="w-3.5 h-3.5 text-zinc-400" />
              <span>Billing &amp; Audit Trail</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Parking History &amp; Receipts
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1">
              Itemized digital receipts for all vehicle check-ins and check-outs across ESP32-CAM nodes.
            </p>
          </div>

          {token && (
            <button
              onClick={() => fetchHistory(token)}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#18181B] border border-white/15 hover:border-white/30 text-zinc-300 hover:text-white text-xs font-semibold transition-all shadow-sm self-start sm:self-auto"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-white' : ''}`} />
              <span>Refresh Records</span>
            </button>
          )}
        </div>

        {/* Content */}
        {!token ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 text-center max-w-md mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-[#18181B] border border-white/15 flex items-center justify-center text-white mb-6">
              <Receipt className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Sign in to View Receipts</h2>
            <p className="text-xs sm:text-sm text-zinc-400 mb-6 leading-relaxed">
              Your official tax invoices, duration logs, and barrier transaction logs are securely linked to your account.
            </p>
            <Link
              href="/login"
              className="district-btn-primary py-3 px-6 text-xs flex items-center justify-center gap-2"
            >
              <span>Sign In to Account</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : loading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 text-zinc-400 gap-3">
            <RefreshCw className="w-8 h-8 animate-spin text-white" />
            <p className="text-sm font-medium">Loading session receipts...</p>
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 text-center max-w-md mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-[#18181B] border border-white/15 flex items-center justify-center text-white mb-6">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Could Not Load Receipts</h2>
            <p className="text-xs sm:text-sm text-zinc-400 mb-6 leading-relaxed">{error}</p>
            <button
              onClick={() => token && fetchHistory(token)}
              className="district-btn-primary py-3 px-6 text-xs flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Try Again</span>
            </button>
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 text-center max-w-md mx-auto">
            <div className="district-squircle w-16 h-16 rounded-2xl mb-6">
              <History className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">No Past Parking Records</h2>
            <p className="text-xs sm:text-sm text-zinc-400 mb-6 leading-relaxed">
              You haven't completed any parking sessions yet. Once your vehicle exits through the exit boom barrier, your itemized invoice will appear here.
            </p>
            <Link
              href="/book"
              className="district-btn-primary py-3 px-6 text-xs flex items-center justify-center gap-2"
            >
              <span>Pre-Book Your First Slot</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* District Aggregate Metrics Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="district-card p-4 sm:p-5">
                <span className="text-xs text-zinc-400 font-semibold">Total Sessions</span>
                <div className="text-3xl font-black text-white mt-1 font-mono">{sessions.length}</div>
              </div>

              <div className="district-card p-4 sm:p-5">
                <span className="text-xs text-zinc-400 font-semibold">Total Amount Paid</span>
                <div className="text-3xl font-black text-white mt-1 flex items-center font-mono">
                  <IndianRupee className="w-6 h-6 mr-0.5" />
                  {totalSpent}
                </div>
              </div>

              <div className="district-card p-4 sm:p-5">
                <span className="text-xs text-zinc-400 font-semibold">Gate Compliance</span>
                <div className="text-3xl font-black text-white mt-1 flex items-center font-mono">
                  100%
                </div>
              </div>
            </div>

            {/* District Search Pill Bar */}
            <div className="relative">
              <div className="district-search-bar flex items-center gap-3">
                <Search className="w-4 h-4 text-zinc-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Search by license plate or bay..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent w-full text-sm text-white placeholder-zinc-500 focus:outline-none font-medium"
                />
              </div>
            </div>

            {/* List of Sessions */}
            <div className="space-y-3">
              {filteredSessions.map((s) => {
                const duration = calculateDurationMinutes(s.entry_time, s.exit_time);
                const fee = calculateFee(duration);
                const isActive = s.status === 'ACTIVE';

                return (
                  <div
                    key={s.id}
                    className="district-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all"
                  >
                    <div className="flex items-start sm:items-center gap-4">
                      <div className={`p-3 rounded-2xl border ${isActive ? 'bg-[#18181B] border-white/20 text-white' : 'bg-[#18181B] border-white/10 text-zinc-400'}`}>
                        <Car className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-black font-mono tracking-wider text-white">
                            {s.plate_number}
                          </span>
                          <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${isActive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-white/[0.05] text-zinc-400 border-white/[0.08]'}`}>
                            {isActive ? '● Currently Parked' : 'Completed'}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
                          <span className="flex items-center gap-1 font-bold text-white">
                            Bay {s.slot_number}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-zinc-500" />
                            {duration} mins
                          </span>
                          <span>•</span>
                          <span>
                            {s.entry_time ? new Date(s.entry_time).toLocaleDateString() : 'Today'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4 pt-3 sm:pt-0 border-t sm:border-t-0 border-white/[0.06]">
                      <div className="text-right">
                        <div className="text-base font-black text-white flex items-center justify-end font-mono">
                          <IndianRupee className="w-4 h-4 mr-0.5 text-zinc-400" />
                          {fee}
                        </div>
                        <span className="text-[10px] text-zinc-500">
                          {isActive ? 'Current Estimate' : 'Standard Rate'}
                        </span>
                      </div>

                      <button
                        onClick={() => openReceipt(s)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#18181B] hover:bg-zinc-800 text-xs font-bold text-white border border-white/15 hover:border-white/30 transition-all"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        <span>View Invoice</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Invoice Modal */}
      {selectedReceipt && (
        <ExitReceiptModal
          receipt={selectedReceipt}
          onClose={() => setSelectedReceipt(null)}
        />
      )}
    </div>
  );
}
