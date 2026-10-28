'use client';

import React from 'react';
import { ParkingSlotData } from '../lib/types';

interface ParkingLayoutProps {
  slots: ParkingSlotData[];
  onManualRelease: (slotNumber: string) => void;
  loading?: boolean;
}

const formatTime = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
};

const Bay: React.FC<{
  slot: ParkingSlotData;
  onManualRelease: (slotNumber: string) => void;
}> = ({ slot, onManualRelease }) => {
  const isAvailable = slot.status === 'AVAILABLE';
  const isAllocated = slot.status === 'ALLOCATED';
  const isOccupied = slot.status === 'OCCUPIED';
  const isBlocked = slot.status === 'BLOCKED' || slot.status === 'MAINTENANCE';

  const plate = slot.active_session?.plate_number ?? null;
  const since = formatTime(slot.active_session?.entry_time);

  const state = isAvailable
    ? 'Available'
    : isAllocated
      ? 'Reserved'
      : isBlocked
        ? 'Blocked'
        : 'Occupied';

  const box = isAvailable
    ? 'border-hair2 bay-hatch'
    : isAllocated
      ? 'border-paintDeep bg-panel2'
      : isBlocked
        ? 'border-fault border-dashed bg-panel'
        : 'border-ink bg-ink text-panel';

  return (
    <div className={`relative border-[1.5px] min-h-[104px] p-3 flex flex-col justify-between ${box}`}>
      {isAllocated && <span className="absolute left-0 top-0 bottom-0 w-[5px] bg-paintDeep" />}

      <div className="flex items-start justify-between gap-2">
        <div className="pl-1">
          <div
            className={`font-sign font-extrabold text-[28px] leading-none tracking-tight ${
              isAvailable || isBlocked ? 'text-ink2' : isOccupied ? 'text-panel' : 'text-ink'
            }`}
          >
            {slot.slot_number}
          </div>
          <div
            className={`mono text-[9.5px] uppercase tracking-[0.1em] mt-1.5 ${
              isOccupied ? 'text-[#BCB6A7]' : 'text-muted'
            }`}
          >
            {state}
          </div>
        </div>

        {!isAvailable && !isBlocked && (
          <button
            onClick={() => onManualRelease(slot.slot_number)}
            className={`text-[10.5px] font-medium px-1 py-0.5 border border-transparent transition-colors ${
              isOccupied
                ? 'text-[#BCB6A7] hover:text-panel hover:border-[#6B675C]'
                : 'text-muted hover:text-ink hover:border-hair2'
            }`}
          >
            Release
          </button>
        )}
      </div>

      <div className="flex items-baseline justify-between gap-2 pl-1 mt-2 min-h-[15px]">
        {plate ? (
          <span className={`mono text-[12px] tracking-[0.02em] ${isOccupied ? 'text-panel' : 'text-ink'}`}>
            {plate}
          </span>
        ) : (
          <span />
        )}
        {since && (
          <span className={`mono text-[10.5px] ${isOccupied ? 'text-[#BCB6A7]' : 'text-muted'}`}>
            {since}
          </span>
        )}
      </div>
    </div>
  );
};

export const ParkingLayout: React.FC<ParkingLayoutProps> = ({
  slots,
  onManualRelease,
  loading = false,
}) => {
  const rowA = slots.filter((s) => s.slot_number.startsWith('A'));
  const rowB = slots.filter((s) => s.slot_number.startsWith('B'));

  return (
    <section className="card">
      <div className="card-head">
        <span className="kicker">Level 0</span>
        <span className="sign-title">Facility plan</span>
        <div className="ml-auto flex items-center gap-4 text-[11px] text-ink2">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-ink" />
            Occupied
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-paint border border-paintDeep" />
            Reserved
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 border border-hair2 bay-hatch" />
            Available
          </span>
        </div>
      </div>

      <div className="px-3.5 pt-4 pb-3.5">
        <div className="flex items-center gap-3 mono text-[9.5px] uppercase tracking-[0.14em] text-muted mb-2.5">
          Zone A · Executive
          <span className="flex-1 h-px bg-hair" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {rowA.map((slot) => (
            <Bay key={slot.id} slot={slot} onManualRelease={onManualRelease} />
          ))}
        </div>

        <div className="my-3.5 h-8 border-y border-dashed border-hair2 flex items-center justify-center mono text-[9.5px] uppercase tracking-[0.16em] text-muted bay-hatch">
          ◀ Central driveway · 10 km/h ▶
        </div>

        <div className="flex items-center gap-3 mono text-[9.5px] uppercase tracking-[0.14em] text-muted mb-2.5">
          Zone B · Standard
          <span className="flex-1 h-px bg-hair" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {rowB.map((slot) => (
            <Bay key={slot.id} slot={slot} onManualRelease={onManualRelease} />
          ))}
        </div>

        {loading && (
          <div className="mono text-[11px] text-muted mt-3">Reading bay state…</div>
        )}
      </div>
    </section>
  );
};
