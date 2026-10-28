'use client';

import React from 'react';
import { X } from 'lucide-react';
import { ExitReceiptData } from '../lib/types';

interface ExitReceiptModalProps {
  receipt: ExitReceiptData | null;
  onClose: () => void;
}

export const ExitReceiptModal: React.FC<ExitReceiptModalProps> = ({ receipt, onClose }) => {
  if (!receipt) return null;
  const isActive = !!receipt.active;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-[2px]">
      <div className="card max-w-[380px] w-full overflow-hidden">
        <div className="card-head">
          <span className="kicker">{isActive ? 'Session open' : 'Exit'}</span>
          <span className="sign-title">Receipt</span>
          <button onClick={onClose} className="ml-auto btn-quiet" aria-label="Close">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-4">
          <div className="bg-[#FFFCF3] border border-hair2 px-4 pt-4 pb-3 relative">
            <span className="absolute -left-[7px] top-1/2 w-3 h-3 rounded-full bg-panel border border-hair2 [clip-path:inset(0_0_0_50%)]" />
            <span className="absolute -right-[7px] top-1/2 w-3 h-3 rounded-full bg-panel border border-hair2 [clip-path:inset(0_50%_0_0)]" />

            <div className="flex items-center justify-between mono text-[9.5px] uppercase tracking-[0.12em] text-muted pb-2.5 border-b border-dashed border-hair2">
              <span>AutoPark · Sanjay Nagar</span>
              <span>{isActive ? 'open' : 'paid'}</span>
            </div>

            <div className="mono text-[20px] font-semibold tracking-[0.06em] mt-3">
              {receipt.plateNumber}
            </div>
            <div className="text-[10.5px] text-muted mt-0.5">Bay {receipt.slot}</div>

            <div className="mt-3 grid gap-1.5 mono text-[11.5px]">
              <div className="flex justify-between">
                <span className="text-muted">Entered</span>
                <span>{receipt.entryTime || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">{isActive ? 'Elapsed' : 'Exited'}</span>
                <span>{isActive ? receipt.durationFormatted : receipt.exitTime}</span>
              </div>
              {!isActive && (
                <div className="flex justify-between">
                  <span className="text-muted">Duration</span>
                  <span>{receipt.durationFormatted}</span>
                </div>
              )}
            </div>

            <div className="mt-3 pt-2.5 border-t border-hair2 flex items-baseline justify-between">
              <span className="mono text-[9.5px] uppercase tracking-[0.12em] text-muted">
                {isActive ? 'Estimated' : 'Total paid'}
              </span>
              <span className="mono text-[19px] font-semibold">
                {receipt.billedAmount == null ? '—' : `₹${receipt.billedAmount}`}
              </span>
            </div>

            <div className="mt-3 h-7 bg-[repeating-linear-gradient(90deg,#33312A_0_2px,transparent_2px_4px,#33312A_4px_5px,transparent_5px_9px,#33312A_9px_12px,transparent_12px_13px)] opacity-85" />
            <div className="flex justify-between mono text-[9px] text-muted tracking-[0.06em] mt-1.5">
              <span>{isActive ? 'barrier open' : 'SG90 release · 90°'}</span>
              <span>{isActive ? 'not yet billed' : receipt.exitTime}</span>
            </div>
          </div>

          <p className="text-[11.5px] text-muted mt-3 leading-relaxed">
            {isActive
              ? 'The vehicle is still inside. The session closes and the bay frees when the exit camera reads the plate.'
              : 'The exit camera read the plate, the session closed and the bay is free again.'}
          </p>

          <button onClick={onClose} className="btn btn-solid w-full py-2.5 mt-3">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
