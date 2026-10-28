'use client';

import React from 'react';
import { ExitReceiptData } from '../lib/types';

interface LastReceiptPanelProps {
  receipt: ExitReceiptData | null;
  onOpen: () => void;
}

/** Ticket for the most recent exit. Same paper treatment as the modal. */
export const LastReceiptPanel: React.FC<LastReceiptPanelProps> = ({ receipt, onOpen }) => {
  return (
    <section className="card">
      <div className="card-head">
        <span className="kicker">Receipt</span>
        <span className="sign-title">Last exit</span>
        <span className="ml-auto mono text-[10.5px] text-muted">
          {receipt ? `${receipt.exitTime} · ${receipt.slot}` : 'none yet'}
        </span>
      </div>

      {!receipt ? (
        <div className="px-3.5 py-7">
          <p className="text-[12.5px] text-muted leading-relaxed">
            No exit has been settled since this page loaded. The ticket appears here when the
            exit camera closes a session.
          </p>
        </div>
      ) : (
        <div className="p-3.5">
          <div className="bg-[#FFFCF3] border border-hair2 px-3.5 pt-3.5 pb-3 relative">
            <span className="absolute -left-[7px] top-1/2 w-3 h-3 rounded-full bg-panel border border-hair2 [clip-path:inset(0_0_0_50%)]" />
            <span className="absolute -right-[7px] top-1/2 w-3 h-3 rounded-full bg-panel border border-hair2 [clip-path:inset(0_50%_0_0)]" />

            <div className="flex items-center justify-between mono text-[9.5px] uppercase tracking-[0.12em] text-muted pb-2.5 border-b border-dashed border-hair2">
              <span>AutoPark · Sanjay Nagar</span>
              <span>{receipt.active ? 'open' : 'paid'}</span>
            </div>

            <div className="font-sign font-extrabold text-[21px] tracking-[0.03em] mt-3 leading-none">
              {receipt.plateNumber}
            </div>
            <div className="mono text-[10.5px] text-muted mt-1.5">
              Bay {receipt.slot}
              {receipt.active ? ' · still inside' : ''}
            </div>

            <div className="mt-3 grid gap-1.5 mono text-[11.5px]">
              <div className="flex justify-between">
                <span className="text-muted">Entry</span>
                <span>{receipt.entryTime || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">{receipt.active ? 'Elapsed' : 'Exit'}</span>
                <span>{receipt.active ? receipt.durationFormatted : receipt.exitTime}</span>
              </div>
              {!receipt.active && (
                <div className="flex justify-between">
                  <span className="text-muted">Duration</span>
                  <span>{receipt.durationFormatted}</span>
                </div>
              )}
            </div>

            <div className="mt-3 pt-2.5 border-t border-hair2 flex items-baseline justify-between">
              <span className="mono text-[9.5px] uppercase tracking-[0.12em] text-muted">
                {receipt.active ? 'Estimated' : 'Total paid'}
              </span>
              <span className="mono text-[18px] font-semibold">
                {receipt.billedAmount == null ? '—' : `₹${receipt.billedAmount}`}
              </span>
            </div>

            <div className="mt-3 h-6 bg-[repeating-linear-gradient(90deg,#33312A_0_2px,transparent_2px_4px,#33312A_4px_5px,transparent_5px_9px,#33312A_9px_12px,transparent_12px_13px)] opacity-85" />
            <div className="flex justify-between mono text-[9px] text-muted tracking-[0.06em] mt-1.5">
              <span>SG90 release · 90°</span>
              <span>{receipt.active ? 'not yet billed' : `printed ${receipt.exitTime}`}</span>
            </div>
          </div>

          <button onClick={onOpen} className="btn w-full py-2 mt-3">
            View receipt
          </button>
        </div>
      )}
    </section>
  );
};
