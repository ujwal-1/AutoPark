'use client';

import React from 'react';
import { ParkingSummary } from '../lib/types';
import { LayoutGrid, CheckCircle2, Clock, Car } from 'lucide-react';

interface StatsOverviewProps {
  summary: ParkingSummary;
}

export const StatsOverview: React.FC<StatsOverviewProps> = ({ summary }) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {/* Total Slots */}
      <div className="district-card p-4 sm:p-5 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Total Bays</p>
          <p className="text-3xl font-black text-white mt-1 font-mono">{summary.total_slots}</p>
        </div>
        <div className="w-11 h-11 rounded-xl bg-[#18181B] border border-white/10 flex items-center justify-center text-white">
          <LayoutGrid className="w-5 h-5" />
        </div>
      </div>

      {/* Available */}
      <div className="district-card p-4 sm:p-5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Available</p>
          </div>
          <p className="text-3xl font-black text-white mt-1 font-mono">{summary.available}</p>
        </div>
        <div className="w-11 h-11 rounded-xl bg-[#18181B] border border-white/10 flex items-center justify-center text-white">
          <CheckCircle2 className="w-5 h-5" />
        </div>
      </div>

      {/* Booked / Reserved */}
      <div className="district-card p-4 sm:p-5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Reserved</p>
          </div>
          <p className="text-3xl font-black text-white mt-1 font-mono">{summary.allocated}</p>
        </div>
        <div className="w-11 h-11 rounded-xl bg-[#18181B] border border-white/10 flex items-center justify-center text-white">
          <Clock className="w-5 h-5" />
        </div>
      </div>

      {/* Occupied */}
      <div className="district-card p-4 sm:p-5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 inline-block" />
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Occupied</p>
          </div>
          <p className="text-3xl font-black text-white mt-1 font-mono">{summary.occupied}</p>
        </div>
        <div className="w-11 h-11 rounded-xl bg-[#18181B] border border-white/10 flex items-center justify-center text-white">
          <Car className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
};
