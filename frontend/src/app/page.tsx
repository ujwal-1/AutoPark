'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Navbar } from '../components/Navbar';
import {
  Car,
  ShieldCheck,
  Zap,
  ArrowRight,
  QrCode,
  Clock,
  Compass,
  CheckCircle2,
  Cpu,
  Receipt,
  Radio,
  Lock,
  ChevronRight,
  Sparkles,
  Search,
  MapPin,
  Camera,
  Layers,
  SlidersHorizontal,
} from 'lucide-react';
import { getApiBaseUrl, getWsUrl } from '../lib/config';
import { ParkingSlotData, ParkingSummary } from '../lib/types';

export default function HomePage() {
  const [summary, setSummary] = useState<ParkingSummary>({
    total_slots: 6,
    available: 6,
    allocated: 0,
    occupied: 0,
    blocked: 0,
  });
  const [slots, setSlots] = useState<ParkingSlotData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedZone, setSelectedZone] = useState<'ALL' | 'A' | 'B'>('ALL');
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const base = getApiBaseUrl();
        const [sumRes, slotRes] = await Promise.all([
          fetch(`${base}/api/parking/summary`),
          fetch(`${base}/api/parking/slots`),
        ]);
        if (sumRes.ok && slotRes.ok) {
          const sumData = await sumRes.json();
          const slotData = await slotRes.json();
          setSummary(sumData);
          setSlots(slotData);
        }
      } catch (_e) {
      } finally {
        setLoading(false);
      }
    };

    fetchSummary();

    const wsUrl = getWsUrl();
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => setWsConnected(true);

    ws.onmessage = (event) => {
      try {
        if (event.data === 'pong') return;
        const msg = JSON.parse(event.data);
        if (
          msg.type === 'slot.allocated' ||
          msg.type === 'slot.released' ||
          msg.type === 'parking.reset' ||
          msg.type === 'barrier.exit'
        ) {
          fetchSummary();
        }
      } catch {}
    };

    ws.onclose = () => setWsConnected(false);

    return () => ws.close();
  }, []);

  const occupancyPercent = summary.total_slots
    ? Math.round(((summary.total_slots - summary.available) / summary.total_slots) * 100)
    : 0;

  const filteredSlots = slots.filter((slot) => {
    const matchesSearch =
      slot.slot_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (slot.active_session?.plate_number &&
        slot.active_session.plate_number.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesZone =
      selectedZone === 'ALL' ||
      (selectedZone === 'A' && slot.slot_number.startsWith('A')) ||
      (selectedZone === 'B' && slot.slot_number.startsWith('B'));

    return matchesSearch && matchesZone;
  });

  return (
    <div className="min-h-screen bg-concrete text-ink flex flex-col selection:bg-ink selection:text-panel">
      <Navbar />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 space-y-8">
        {/* District App Header & Search Bar */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold text-ink tracking-tight">
                Find available bays &amp; smart gates
              </h1>
            </div>

            {/* Live Deck Telemetry Mini Pill */}
            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-sm bg-panel border border-hair2 text-xs self-start sm:self-auto whitespace-nowrap">
              <span className="w-2 h-2 rounded-full bg-ok"></span>
              <span className="text-ink2 font-medium">Bays Available:</span>
              <span className="font-mono font-bold text-ink">{summary.available} / {summary.total_slots}</span>
            </div>
          </div>

          {/* District Signature Pill Search Bar */}
          <div className="relative">
            <div className="district-search-bar flex items-center gap-3">
              <Search className="w-4 h-4 text-ink2 shrink-0" />
              <input
                type="text"
                placeholder="Search 'Bay A1', 'DL-01-AB', or 'Zone B'..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent w-full text-sm text-ink placeholder-muted focus:outline-none font-medium"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-xs text-ink2 hover:text-ink"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Essential Driver Actions (Clean Monochrome District Cards) */}
        <section className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Action 1: Pre-Book */}
            <Link
              href="/book"
              className="district-card district-card-interactive p-4 sm:p-5 flex items-center gap-4 group"
            >
              <div className="district-squircle bg-panel2 border-hair group-hover:border-ink group-hover:scale-105 transition-transform shrink-0">
                <Car className="w-6 h-6 text-ink" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-ink group-hover:text-ink transition-colors">
                  Pre-Book Bay
                </span>
                <span className="text-xs text-ink2 mt-0.5">
                  Reserve a guaranteed spot
                </span>
              </div>
            </Link>

            {/* Action 2: Active Pass */}
            <Link
              href="/pass"
              className="district-card district-card-interactive p-4 sm:p-5 flex items-center gap-4 group"
            >
              <div className="district-squircle bg-panel2 border-hair group-hover:border-ink group-hover:scale-105 transition-transform shrink-0">
                <QrCode className="w-6 h-6 text-ink" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-ink group-hover:text-ink transition-colors">
                  Active Gate Pass
                </span>
                <span className="text-xs text-ink2 mt-0.5">
                  Digital clearance &amp; status
                </span>
              </div>
            </Link>

            {/* Action 3: Receipts */}
            <Link
              href="/history"
              className="district-card district-card-interactive p-4 sm:p-5 flex items-center gap-4 group"
            >
              <div className="district-squircle bg-panel2 border-hair group-hover:border-ink group-hover:scale-105 transition-transform shrink-0">
                <Receipt className="w-6 h-6 text-ink" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-ink group-hover:text-ink transition-colors">
                  Parking Receipts
                </span>
                <span className="text-xs text-ink2 mt-0.5">
                  Itemized invoices &amp; bills
                </span>
              </div>
            </Link>
          </div>
        </section>

        {/* Smart Parking Bays Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-ink tracking-tight">
              Available Parking Bays
            </h2>

            {/* Zone Filter Tabs (Monochrome Pill Tabs) */}
            <div className="flex items-center gap-1.5 ml-4 bg-panel p-1 rounded-sm border border-hair">
              {(['ALL', 'A', 'B'] as const).map((z) => (
                <button
                  key={z}
                  onClick={() => setSelectedZone(z)}
                  className={`px-3 py-1 rounded-sm text-xs font-bold transition-all ${
                    selectedZone === z
                      ? 'bg-ink text-panel'
                      : 'text-ink2 hover:text-ink'
                  }`}
                >
                  {z === 'ALL' ? 'All Bays' : `Zone ${z}`}
                </button>
              ))}
            </div>
          </div>

          {/* District Style Bay Cards Grid (Black & White Outline Design) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-44 rounded-sm bg-panel border border-hair animate-pulse"></div>
              ))
            ) : filteredSlots.length === 0 ? (
              <div className="col-span-full py-12 text-center text-ink2">
                No parking bays matched your search query.
              </div>
            ) : (
              filteredSlots.map((slot) => {
                const isVacant = slot.status === 'AVAILABLE';
                const isOccupied = slot.status === 'OCCUPIED';
                const zone = slot.slot_number.startsWith('A') ? 'Zone A (North Deck)' : 'Zone B (South Deck)';

                return (
                  <div
                    key={slot.id}
                    className="district-card district-card-interactive p-5 flex flex-col justify-between group bg-panel border border-hair"
                  >
                    {/* Top Bay Badge & Status */}
                    <div className="flex items-center justify-between pb-3 border-b border-hair">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-panel2 border border-hair flex items-center justify-center font-mono font-semibold text-ink text-sm">
                          {slot.slot_number}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-ink">Bay {slot.slot_number}</div>
                          <div className="text-[10px] text-ink2">{zone}</div>
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-sm border tracking-wider ${
                          isVacant
                            ? 'bg-ok/10 text-ok border-ok/50'
                            : isOccupied
                            ? 'bg-ink text-panel border-ink'
                            : 'bg-paint/50 text-[#8A6A1E] border-paintDeep'
                        }`}
                      >
                        {isVacant ? '● Vacant' : isOccupied ? 'Occupied' : 'Reserved'}
                      </span>
                    </div>

                    {/* Middle Info */}
                    <div className="my-4 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-ink2 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-ink2" />
                          Location
                        </span>
                        <span className="font-semibold text-ink">Tech Hub Gate 1</span>
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span className="text-ink2 flex items-center gap-1.5">
                          <Car className="w-3.5 h-3.5 text-ink2" />
                          Vehicle Plate
                        </span>
                        <span className="font-mono font-bold text-ink">
                          {slot.active_session?.plate_number || 'None (Available)'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span className="text-ink2 flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5 text-ink2" />
                          Standard Rate
                        </span>
                        <span className="font-bold text-ink">₹30 / hour</span>
                      </div>
                    </div>

                    {/* Bottom Action Button (Solid White vs Dark Outline) */}
                    {isVacant ? (
                      <Link
                        href={`/book?slot=${slot.slot_number}`}
                        className="district-btn-primary w-full inline-flex items-center justify-center gap-2 py-2.5 text-xs font-bold transition-all active:scale-95"
                      >
                        <span>Pre-Book Bay</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    ) : (
                      <Link
                        href="/pass"
                        className="district-btn-secondary w-full inline-flex items-center justify-center gap-2 py-2.5 text-xs font-semibold transition-all"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        <span>View Active Pass</span>
                      </Link>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </main>

      {/* District App Footer */}
      <footer className="border-t border-hair py-6" />
    </div>
  );
}
