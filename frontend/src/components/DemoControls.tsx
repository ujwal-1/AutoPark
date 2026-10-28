'use client';

import React, { useState } from 'react';
import { Play, RotateCcw, Unlock, Cpu } from 'lucide-react';

interface DemoControlsProps {
  onSimulateEntry: (authorized?: boolean) => void;
  onSimulateExit: () => void;
  onResetDemo: () => void;
  onManualReleaseSlot: (slotNumber: string) => void;
  availableSlots: string[];
  loading: boolean;
}

export const DemoControls: React.FC<DemoControlsProps> = ({
  onSimulateEntry,
  onSimulateExit,
  onResetDemo,
  onManualReleaseSlot,
  loading,
}) => {
  const [selectedReleaseSlot, setSelectedReleaseSlot] = useState<string>('A1');

  return (
    <div className="district-card p-6 h-full flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/[0.08]">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Cpu className="w-4 h-4 text-zinc-400" />
            Gate &amp; Boom Barrier Simulator
          </h2>
          <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-[#18181B] text-zinc-400 border border-white/10">
            HIL Testing
          </span>
        </div>

        <p className="text-xs text-zinc-400 mb-5 font-normal leading-relaxed">
          Test camera ANPR matching, dual SG90 servo boom barrier actuation (0°/90°), and pre-booking gate security clearances.
        </p>

        {/* Demo Triggers (Clean District Style Buttons) */}
        <div className="space-y-3 mb-6">
          <button
            onClick={() => onSimulateEntry(true)}
            disabled={loading}
            className="w-full py-3 px-4 rounded-full bg-white hover:bg-zinc-200 text-black font-bold text-xs tracking-wider uppercase transition-all shadow-sm active:scale-98 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Play className="w-3.5 h-3.5 fill-black text-black" />
            Simulate Pre-Booked Entry (Lift Barrier)
          </button>

          <button
            onClick={() => onSimulateEntry(false)}
            disabled={loading}
            className="w-full py-3 px-4 rounded-full bg-[#18181B] hover:bg-zinc-800 text-white font-bold text-xs tracking-wider uppercase border border-white/15 hover:border-white/30 transition-all active:scale-98 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            Simulate Unregistered Entry (Barrier Locked)
          </button>

          <button
            onClick={onSimulateExit}
            disabled={loading}
            className="w-full py-3 px-4 rounded-full bg-[#18181B] hover:bg-zinc-800 text-white font-bold text-xs tracking-wider uppercase border border-white/15 hover:border-white/30 transition-all active:scale-98 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Play className="w-3.5 h-3.5 fill-white text-white" />
            Simulate Vehicle Exit (Lift Barrier)
          </button>
        </div>

        {/* Manual Release Override */}
        <div className="p-4 rounded-2xl bg-[#18181B] border border-white/10 mb-6">
          <label className="text-xs font-bold text-zinc-300 block mb-2 flex items-center gap-1.5">
            <Unlock className="w-3.5 h-3.5 text-zinc-400" />
            Manual Slot Release Override
          </label>

          <div className="flex gap-2">
            <select
              value={selectedReleaseSlot}
              onChange={(e) => setSelectedReleaseSlot(e.target.value)}
              className="flex-1 bg-[#121214] border border-white/15 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-white/40"
            >
              {['A1', 'A2', 'A3', 'B1', 'B2', 'B3'].map((slotNum) => (
                <option key={slotNum} value={slotNum} className="bg-[#121214] text-white">
                  Slot {slotNum}
                </option>
              ))}
            </select>

            <button
              onClick={() => onManualReleaseSlot(selectedReleaseSlot)}
              disabled={loading}
              className="py-2 px-4 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-bold transition-colors active:scale-95 disabled:opacity-50"
            >
              Release
            </button>
          </div>
        </div>
      </div>

      {/* Reset Facility */}
      <button
        onClick={onResetDemo}
        disabled={loading}
        className="w-full py-2.5 px-4 rounded-full bg-[#18181B] hover:bg-zinc-800 text-zinc-400 hover:text-white font-bold text-xs uppercase tracking-wider border border-white/10 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        Reset Facility &amp; Gates
      </button>
    </div>
  );
};
