'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Car, Clock, IndianRupee, ShieldCheck, X } from 'lucide-react';
import { ExitReceiptData } from '../lib/types';

interface ExitReceiptModalProps {
  receipt: ExitReceiptData | null;
  onClose: () => void;
}

export const ExitReceiptModal: React.FC<ExitReceiptModalProps> = ({ receipt, onClose }) => {
  if (!receipt) return null;
  const isActive = !!receipt.active;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="district-card bg-[#121214] rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-white/20"
        >
          {/* Header */}
          <div className="bg-[#18181B] border-b border-white/10 p-6 relative">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-white/10 rounded-2xl border border-white/15">
                {isActive ? <Clock className="w-6 h-6 text-white" /> : <CheckCircle2 className="w-6 h-6 text-white" />}
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest bg-white/10 text-zinc-300 px-2.5 py-0.5 rounded-full border border-white/10">
                  {isActive ? 'Session In Progress • Barrier Open' : 'Gate Cleared • Barrier Open'}
                </span>
                <h3 className="text-xl font-black text-white mt-1">
                  {isActive ? 'Active Parking Receipt' : 'Exit Clearance Receipt'}
                </h3>
              </div>
            </div>
          </div>

          {/* Receipt Body */}
          <div className="p-6 bg-[#121214]">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/10">
              <span className="text-xs font-bold text-zinc-400 uppercase">License Plate</span>
              <span className="px-3 py-1 bg-black text-white font-mono font-bold text-sm rounded-xl border border-white/20 tracking-wider">
                {receipt.plateNumber}
              </span>
            </div>

            <div className="space-y-3.5 mb-6 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 flex items-center gap-2">
                  <Car className="w-4 h-4 text-zinc-400" />
                  {isActive ? 'Parking Bay Occupied' : 'Parking Bay Released'}
                </span>
                <span className="font-black text-white font-mono text-base">
                  Slot {receipt.slot}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-zinc-400 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-zinc-400" />
                  {isActive ? 'Elapsed Duration' : 'Total Parked Duration'}
                </span>
                <span className="font-bold text-white font-mono">
                  {receipt.durationFormatted}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-zinc-400 flex items-center gap-2">
                  <IndianRupee className="w-4 h-4 text-zinc-400" />
                  {isActive ? 'Estimated Fee (Standard Rate)' : 'Parking Fee (Standard Rate)'}
                </span>
                <span className="font-black text-white text-xl font-mono">
                  {receipt.billedAmount == null ? '—' : `₹${receipt.billedAmount}.00`}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-zinc-500 pt-2 border-t border-dashed border-white/10">
                <span>{isActive ? 'Entry Timestamp' : 'Exit Timestamp'}</span>
                <span>{isActive ? receipt.entryTime || '—' : receipt.exitTime}</span>
              </div>
            </div>

            {/* Verification Badge */}
            <div className="p-3.5 bg-[#18181B] border border-white/10 rounded-2xl mb-6 flex items-center gap-2.5 text-xs text-zinc-300">
              <ShieldCheck className="w-4 h-4 text-white shrink-0" />
              <span>
                {isActive
                  ? 'Vehicle is inside the facility. The invoice is finalized and this bay released when the exit camera confirms departure.'
                  : 'Exit camera confirmed departure. Boom barrier servo lifted (90°) for safe exit.'}
              </span>
            </div>

            {/* Action Buttons */}
            <button
              onClick={onClose}
              className="district-btn-primary w-full py-3.5 text-xs uppercase tracking-wider flex items-center justify-center gap-2"
            >
              <span>Close Receipt</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
