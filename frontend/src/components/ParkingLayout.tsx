'use client';

import React from 'react';
import { ParkingSlotData } from '../lib/types';
import { Car, Check, Ban, Loader2, Navigation, Layers } from 'lucide-react';
import { motion } from 'framer-motion';

interface ParkingLayoutProps {
  slots: ParkingSlotData[];
  onManualRelease: (slotNumber: string) => void;
  loading?: boolean;
}

export const ParkingLayout: React.FC<ParkingLayoutProps> = ({ slots, onManualRelease, loading = false }) => {
  const rowA = slots.filter((s) => s.slot_number.startsWith('A'));
  const rowB = slots.filter((s) => s.slot_number.startsWith('B'));

  const renderSeatCard = (slot: ParkingSlotData) => {
    const isAvailable = slot.status === 'AVAILABLE';
    const isAllocated = slot.status === 'ALLOCATED';
    const isOccupied = slot.status === 'OCCUPIED';
    const isBlocked = slot.status === 'BLOCKED' || slot.status === 'MAINTENANCE';

    let cardClasses = 'bg-[#121214] border border-white/10 text-white';
    let badge = 'OCCUPIED';
    let badgeCls = 'bg-white/5 text-zinc-400 border-white/10';

    if (isAvailable) {
      cardClasses = 'bg-[#121214] border border-white/10 hover:border-white/30 text-white';
      badge = 'AVAILABLE';
      badgeCls = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    } else if (isAllocated) {
      cardClasses = 'bg-[#141416] border border-white/20 text-white';
      badge = 'RESERVED';
      badgeCls = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    } else if (isOccupied) {
      cardClasses = 'bg-[#141416] border border-white/15 text-white';
      badge = 'OCCUPIED';
      badgeCls = 'bg-white/10 text-zinc-300 border-white/15';
    } else if (isBlocked) {
      cardClasses = 'bg-[#0E0E10] border border-white/5 text-zinc-600 cursor-not-allowed';
      badge = 'BLOCKED';
      badgeCls = 'bg-white/5 text-zinc-600 border-white/5';
    }

    const plate = slot.active_session?.plate_number;
    const vehName = slot.active_session?.vehicle_type ? slot.active_session.vehicle_type.replace('_', ' ') : 'Car';
    const subtext = isAvailable ? 'Free Slot' : plate ? plate : vehName;

    return (
      <motion.div
        key={slot.id}
        whileHover={!isBlocked ? { scale: 1.01 } : undefined}
        whileTap={!isBlocked ? { scale: 0.99 } : undefined}
        className={`relative p-5 rounded-2xl transition-all duration-200 flex flex-col justify-between min-h-[170px] cursor-pointer ${cardClasses}`}
      >
        {/* Slot Number + Badge */}
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono tracking-tight text-white">
              {slot.slot_number}
            </span>
            <span className="text-[10px] text-zinc-400 font-semibold">
              {slot.slot_number.startsWith('A') ? 'North' : 'South'}
            </span>
          </div>

          <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${badgeCls}`}>
            {badge}
          </span>
        </div>

        {/* Center Visual Icon */}
        <div className="flex items-center justify-center my-3">
          {isAvailable ? (
            <div className="w-11 h-11 rounded-xl bg-[#18181B] border border-white/10 flex items-center justify-center text-emerald-400">
              <Check className="w-5 h-5 stroke-[2.5]" />
            </div>
          ) : isOccupied || isAllocated ? (
            <div className="w-11 h-11 rounded-xl bg-[#18181B] border border-white/15 flex items-center justify-center text-white">
              <Car className="w-5 h-5" />
            </div>
          ) : (
            <div className="w-11 h-11 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-zinc-600">
              <Ban className="w-5 h-5" />
            </div>
          )}
        </div>

        {/* Bottom Details & Manual Release */}
        <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between">
          <div>
            <div className="text-[10px] text-zinc-400 font-medium">Assignment</div>
            <div className={`text-xs font-mono font-bold tracking-wider ${isAvailable ? 'text-zinc-400' : 'text-white'}`}>
              {subtext}
            </div>
          </div>

          {!isAvailable && !isBlocked && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onManualRelease(slot.slot_number);
              }}
              className="text-[10px] font-bold text-zinc-300 hover:text-white px-3 py-1 rounded-full bg-[#18181B] hover:bg-zinc-800 border border-white/15 transition-colors"
            >
              Release
            </button>
          )}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="district-card p-6 sm:p-8">
      {/* Driving Lane Header Banner */}
      <div className="mb-6 text-center relative pb-4 border-b border-white/[0.08]">
        <span className="text-[11px] font-bold tracking-widest text-zinc-400 uppercase flex items-center justify-center gap-2">
          <Navigation className="w-3.5 h-3.5 text-zinc-400 rotate-45" />
          Main Entrance Gate &amp; Directional Driving Aisle
          <Navigation className="w-3.5 h-3.5 text-zinc-400 -rotate-45" />
        </span>
      </div>

      {/* Title & Legend */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-zinc-400" />
            2D Facility Digital Twin
          </h2>
          <p className="text-xs text-zinc-400">Real-time bay occupancy synchronized via WebSocket event stream</p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs font-semibold">
          <span className="flex items-center gap-1.5 text-zinc-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Available
          </span>
          <span className="flex items-center gap-1.5 text-zinc-300">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            Reserved
          </span>
          <span className="flex items-center gap-1.5 text-zinc-300">
            <span className="w-2 h-2 rounded-full bg-zinc-500" />
            Occupied
          </span>
        </div>
      </div>

      {/* Loading Overlay */}
      {loading && (
        <div className="py-12 flex items-center justify-center text-zinc-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-white" />
          <span className="text-xs font-semibold">Synchronizing bay state...</span>
        </div>
      )}

      {/* 2D Parking Grid */}
      <div className="space-y-6">
        {/* Zone A */}
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
            Zone A • Executive Bays (A1 – A3)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {rowA.map(renderSeatCard)}
          </div>
        </div>

        {/* Central Driveway Divider */}
        <div className="py-2.5 flex items-center justify-center gap-4 text-[10px] font-mono tracking-widest text-zinc-500 uppercase border-y border-dashed border-white/[0.08]">
          <span>◀ Central Driveway Lane • Speed Limit 10 km/h ▶</span>
        </div>

        {/* Zone B */}
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
            Zone B • Standard Bays (B1 – B3)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {rowB.map(renderSeatCard)}
          </div>
        </div>
      </div>
    </div>
  );
};
