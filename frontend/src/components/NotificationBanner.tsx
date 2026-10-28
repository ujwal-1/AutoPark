'use client';

import React from 'react';
import { Volume2, X, CheckCircle, Car, Ticket } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface NotificationBannerProps {
  allocatedSlot: string | null;
  vehicleType: string;
  plateNumber?: string | null;
  triggerBuzzer: boolean;
  onDismiss: () => void;
}

export const NotificationBanner: React.FC<NotificationBannerProps> = ({
  allocatedSlot,
  vehicleType,
  plateNumber,
  triggerBuzzer,
  onDismiss,
}) => {
  if (!allocatedSlot) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -15 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -15 }}
        className="mb-6 p-5 rounded-2xl bg-[#121214] border border-white/20 shadow-2xl relative overflow-hidden flex items-center justify-between"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#18181B] border border-white/10 text-white flex items-center justify-center shrink-0">
            <Ticket className="w-6 h-6" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-bold uppercase bg-[#18181B] text-zinc-300 border border-white/10">
                <CheckCircle className="w-3.5 h-3.5 text-zinc-400" />
                Slot Confirmed & Assigned
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                Boom Barrier Lifted (90°)
              </span>
            </div>

            <h2 className="text-xl font-black text-white mt-1.5 flex items-center gap-3">
              Allocated Bay: <span className="text-white font-mono font-black">{allocatedSlot}</span>
              {plateNumber && (
                <span className="px-2.5 py-0.5 bg-black text-zinc-200 font-mono font-bold text-xs rounded-lg border border-white/20 tracking-widest">
                  {plateNumber}
                </span>
              )}
            </h2>
            <p className="text-xs text-zinc-400 mt-1 flex items-center gap-1.5 font-medium">
              <Car className="w-4 h-4 text-zinc-400" />
              Vehicle Identified: <strong className="text-white uppercase font-semibold">{(vehicleType || 'Vehicle').replace('_', ' ')}</strong>. Servo boom barrier is open — please proceed to Bay {allocatedSlot}.
            </p>
          </div>
        </div>

        <button
          onClick={onDismiss}
          className="p-2.5 bg-[#18181B] hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-full transition-colors border border-white/10"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </motion.div>
    </AnimatePresence>
  );
};
