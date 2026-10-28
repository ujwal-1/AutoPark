'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Navbar } from '../../components/Navbar';
import {
  Car,
  CalendarCheck,
  Clock,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Zap,
  MapPin,
  IndianRupee,
  Layers,
} from 'lucide-react';
import { getApiBaseUrl } from '../../lib/config';

interface BayInfo {
  id: number;
  slot_number: string;
  status: string;
}

function BookForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const querySlot = searchParams?.get('slot')?.toUpperCase() || '';

  const [plateNumber, setPlateNumber] = useState('');
  const [vehicleType, setVehicleType] = useState('Car');
  const [durationHours, setDurationHours] = useState(2);
  const [availableSlotsCount, setAvailableSlotsCount] = useState<number>(6);
  const [bays, setBays] = useState<BayInfo[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>(querySlot);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const userStr = typeof window !== 'undefined' ? localStorage.getItem('autopark_user') : null;
    if (userStr) {
      try {
        const u = JSON.parse(userStr);
        if (u.vehicle_plate) setPlateNumber(u.vehicle_plate);
      } catch {}
    }

    const fetchBaysAndSummary = async () => {
      try {
        const base = getApiBaseUrl();
        const [sumRes, layoutRes] = await Promise.all([
          fetch(`${base}/api/parking/summary`),
          fetch(`${base}/api/parking/layout`),
        ]);

        if (sumRes.ok) {
          const sumData = await sumRes.json();
          setAvailableSlotsCount(sumData.available);
        }

        if (layoutRes.ok) {
          const layoutData = await layoutRes.json();
          const slotsList: BayInfo[] = layoutData.slots || [];
          setBays(slotsList);

          // If a slot query was in URL, verify or pick it; otherwise pick first available
          if (querySlot) {
            setSelectedSlot(querySlot);
          } else {
            const firstAvail = slotsList.find((s) => s.status === 'AVAILABLE');
            if (firstAvail) {
              setSelectedSlot(firstAvail.slot_number);
            }
          }
        }
      } catch {}
    };

    fetchBaysAndSummary();
  }, [querySlot]);

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const base = getApiBaseUrl();
    let token = localStorage.getItem('autopark_token');

    const cleanPlate = plateNumber.trim().toUpperCase();
    if (cleanPlate.length < 4) {
      setError('Please enter a valid license plate number (e.g. DL-01-AB-1234).');
      return;
    }

    if (!selectedSlot) {
      setError('Please select an available parking bay.');
      return;
    }

    setLoading(true);
    try {
      if (!token) {
        // Guest driver auto-provisioning
        const guestName = `driver_${Math.floor(1000 + Math.random() * 9000)}`;
        try {
          await fetch(`${base}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: guestName,
              password: 'password123',
              email: `${guestName}@autopark.io`,
            }),
          });
        } catch (_) {}

        const loginRes = await fetch(`${base}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: guestName,
            password: 'password123',
          }),
        });
        const loginData = await loginRes.json();
        if (loginData.access_token) {
          token = loginData.access_token;
          localStorage.setItem('autopark_token', loginData.access_token);
          localStorage.setItem('autopark_user', JSON.stringify(loginData.user || { username: guestName }));
        }
      }

      if (!token) {
        throw new Error('Authentication required. Please sign in.');
      }

      const res = await fetch(`${base}/api/bookings/pre-checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          plate_number: cleanPlate,
          vehicle_type: vehicleType,
          duration_hours: durationHours,
          slot_number: selectedSlot,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Booking failed');
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/pass');
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Could not complete pre-booking');
    } finally {
      setLoading(false);
    }
  };

  const estimatedFee = durationHours * 30;

  // Fallback bays list if layout API hasn't loaded yet
  const displayBays = bays.length > 0 ? bays : [
    { id: 1, slot_number: 'A1', status: 'AVAILABLE' },
    { id: 2, slot_number: 'A2', status: 'AVAILABLE' },
    { id: 3, slot_number: 'A3', status: 'AVAILABLE' },
    { id: 4, slot_number: 'B1', status: 'AVAILABLE' },
    { id: 5, slot_number: 'B2', status: 'AVAILABLE' },
    { id: 6, slot_number: 'B3', status: 'AVAILABLE' },
  ];

  return (
    <div className="district-card overflow-hidden grid grid-cols-1 md:grid-cols-5 border border-white/[0.08] shadow-districtCard">
      {/* Left Form (3 cols) */}
      <div className="p-6 sm:p-8 md:col-span-3 bg-[#121214]">
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {success ? (
          <div className="py-16 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-white text-black flex items-center justify-center mb-4 shadow-sm">
              <CheckCircle2 className="w-10 h-10 animate-bounce" />
            </div>
            <h3 className="text-xl font-black text-white">Bay {selectedSlot} Reserved!</h3>
            <p className="text-xs text-zinc-400 mt-1">
              Opening active gate clearance pass with designated bay routing...
            </p>
          </div>
        ) : (
          <form onSubmit={handleBooking} className="space-y-6">
            {/* 1. Select Parking Bay */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-300">
                  Select Parking Bay
                </label>
                <span className="text-xs font-mono text-zinc-400">
                  {selectedSlot ? `Bay ${selectedSlot} Selected` : 'Choose a bay'}
                </span>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {displayBays.map((bay) => {
                  const isVacant = bay.status === 'AVAILABLE';
                  const isSelected = selectedSlot === bay.slot_number;
                  const isOccupied = bay.status === 'OCCUPIED';
                  const isReserved = bay.status === 'ALLOCATED';

                  return (
                    <button
                      key={bay.slot_number}
                      type="button"
                      disabled={!isVacant && !isSelected}
                      onClick={() => setSelectedSlot(bay.slot_number)}
                      className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1 ${
                        isSelected
                          ? 'bg-white text-black border-white ring-2 ring-white/20 shadow-md font-black'
                          : isVacant
                          ? 'bg-[#18181B] text-zinc-300 border-white/[0.08] hover:border-white/30 hover:text-white cursor-pointer'
                          : 'bg-[#141416]/50 text-zinc-600 border-white/[0.04] cursor-not-allowed opacity-60'
                      }`}
                    >
                      <span className="text-xs font-black font-mono">
                        {bay.slot_number}
                      </span>
                      <span
                        className={`text-[9px] uppercase font-bold tracking-tight ${
                          isSelected
                            ? 'text-black'
                            : isVacant
                            ? 'text-emerald-400'
                            : isOccupied
                            ? 'text-rose-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {isSelected ? 'SELECTED' : isVacant ? 'VACANT' : isOccupied ? 'BUSY' : 'HELD'}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-zinc-400 mt-1.5 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-zinc-400" />
                <span>Zone A: Bays A1–A3 (North Deck) • Zone B: Bays B1–B3 (South Deck)</span>
              </p>
            </div>

            {/* 2. License Plate Input */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-300 mb-2">
                Vehicle License Plate Number
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="e.g. DL-01-AB-1234"
                  value={plateNumber}
                  onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
                  className="w-full px-4 py-3 rounded-xl bg-[#18181B] border border-white/[0.1] text-white font-mono text-base font-black tracking-widest uppercase focus:border-white focus:ring-1 focus:ring-white/20 outline-none transition-all placeholder-zinc-500"
                />
                <span className="absolute right-3.5 top-3 px-2 py-0.5 rounded bg-black/60 text-[10px] font-bold text-amber-400 font-mono border border-amber-400/30">
                  IND
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-1.5">
                Our optical camera ANPR matches this license plate at the gate to raise the boom barrier.
              </p>
            </div>

            {/* 3. Vehicle Type Selector */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-300 mb-2">
                Vehicle Category
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { id: 'Car', label: 'Car / Sedan', icon: '🚗' },
                  { id: 'SUV', label: 'SUV / 4x4', icon: '🚙' },
                  { id: 'EV', label: 'Electric EV', icon: '⚡' },
                ].map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVehicleType(v.id)}
                    className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all ${
                      vehicleType === v.id
                        ? 'bg-white text-black border-white shadow-sm'
                        : 'bg-[#18181B] border-white/[0.08] text-zinc-400 hover:bg-[#202026] hover:text-white'
                    }`}
                  >
                    <span className="text-xl">{v.icon}</span>
                    <span>{v.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Duration Selector */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                  Expected Parking Duration
                </label>
                <span className="text-xs font-bold text-white font-mono">
                  {durationHours} {durationHours === 1 ? 'Hour' : 'Hours'}
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="8"
                step="1"
                value={durationHours}
                onChange={(e) => setDurationHours(Number(e.target.value))}
                className="w-full accent-white cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-zinc-400 font-mono mt-1">
                <span>1h</span>
                <span>2h</span>
                <span>4h</span>
                <span>6h</span>
                <span>8h</span>
              </div>
            </div>

            {/* 5. Submit Action */}
            <button
              type="submit"
              disabled={loading || availableSlotsCount <= 0 || !selectedSlot}
              className="district-btn-primary w-full py-3.5 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm active:scale-98"
            >
              {loading ? (
                <span>Securing Bay {selectedSlot}...</span>
              ) : availableSlotsCount <= 0 ? (
                <span>All Bays Currently Full</span>
              ) : (
                <>
                  <span>Confirm Bay {selectedSlot} Reservation (₹{estimatedFee})</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}
      </div>

      {/* Right VIP Pass Summary (2 cols) */}
      <div className="p-6 sm:p-8 md:col-span-2 bg-[#0E0E10] border-t md:border-t-0 md:border-l border-white/[0.08] flex flex-col justify-between space-y-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-300 mb-4">
            <Sparkles className="w-4 h-4 text-white" />
            <span>Gate Clearance Summary</span>
          </div>

          {/* Reserved Bay Highlight Box */}
          <div className="p-4 rounded-xl bg-[#141416] border border-white/[0.1] mb-4">
            <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
              Assigned Parking Bay
            </div>
            <div className="text-3xl font-black font-mono text-white mt-1">
              BAY {selectedSlot || 'A1'}
            </div>
            <div className="text-xs text-zinc-400 mt-1 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-zinc-300" />
              <span>
                {selectedSlot?.startsWith('B') ? 'Zone B (South Deck)' : 'Zone A (North Deck)'} • Tech Hub Gate 1
              </span>
            </div>
          </div>

          {/* Price Breakdown Card */}
          <div className="p-4 rounded-xl bg-[#141416] border border-white/[0.08] space-y-3 mb-6">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Rate Card</span>
              <span className="font-semibold text-white">₹30 / Hour</span>
            </div>
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Duration</span>
              <span className="font-semibold text-white">{durationHours} Hours</span>
            </div>
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Gate Automation</span>
              <span className="font-semibold text-emerald-400">Dual ESP32 ANPR</span>
            </div>
            <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between">
              <span className="text-xs font-bold text-white">Total Due</span>
              <span className="text-2xl font-black text-white font-mono">
                ₹{estimatedFee}.00
              </span>
            </div>
          </div>

          {/* District Feature Highlights */}
          <div className="space-y-3 text-xs text-zinc-400">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong className="text-white">Instant Gate Clearance:</strong> Optical camera matches your plate and automatically opens the boom barrier.
              </span>
            </div>
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong className="text-white">Guaranteed Bay Hold:</strong> Bay {selectedSlot || 'selected'} remains strictly reserved for your vehicle.
              </span>
            </div>
          </div>
        </div>

        <div className="text-[10px] text-zinc-500 font-mono text-center pt-4 border-t border-white/[0.06]">
          AutoPark Smart Mobility Hub
        </div>
      </div>
    </div>
  );
}

export default function BookPage() {
  return (
    <div className="min-h-screen bg-districtBg text-white flex flex-col selection:bg-white/20 selection:text-white">
      <Navbar />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8">
        {/* District App Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2">
              Reserve a Parking Bay
            </h1>
          </div>
        </div>

        <Suspense fallback={<div className="p-12 text-center text-zinc-400">Loading bay selector...</div>}>
          <BookForm />
        </Suspense>
      </main>
    </div>
  );
}
