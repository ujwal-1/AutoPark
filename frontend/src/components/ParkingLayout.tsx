'use client';

import React from 'react';
import { ParkingSlotData } from '../lib/types';
import { clockTime, dwellSince } from '../lib/time';

interface ParkingLayoutProps {
  slots: ParkingSlotData[];
  /** Barrier arm positions, driven by the detection state on the page. */
  entryBarrierOpen?: boolean;
  exitBarrierOpen?: boolean;
  loading?: boolean;
}

const GateColumn: React.FC<{ label: string; open: boolean }> = ({ label, open }) => (
  <div className="hidden lg:flex flex-col items-center justify-between border border-hair2 bg-panel2 px-1.5 py-2.5 gap-1.5">
    <span className="mono text-[9px] uppercase tracking-[0.12em] text-muted">{label}</span>
    <span className="relative block w-8 h-2.5" aria-hidden="true">
      <span className="absolute left-0 top-0 w-[2px] h-3.5 bg-ink" />
      <span
        className={`absolute left-[2px] top-[4px] h-[4px] w-[30px] origin-left border-y border-ink/40 transition-transform duration-300 ${
          open ? 'barrier-stripe -rotate-[32deg]' : 'barrier-stripe'
        }`}
      />
    </span>
    <span className="font-sign font-bold text-[10.5px] tracking-[0.05em] text-center leading-tight">
      {open ? 'UP' : 'DOWN'}
      <br />
      {open ? '90°' : '0°'}
    </span>
  </div>
);

const Bay: React.FC<{ slot: ParkingSlotData }> = ({ slot }) => {
  const isAvailable = slot.status === 'AVAILABLE';
  const isAllocated = slot.status === 'ALLOCATED';
  const isOccupied = slot.status === 'OCCUPIED';
  const isBlocked = slot.status === 'BLOCKED' || slot.status === 'MAINTENANCE';

  const plate = slot.active_session?.plate_number ?? null;
  const since = clockTime(slot.active_session?.entry_time);
  const dwell = isOccupied ? dwellSince(slot.active_session?.entry_time) : null;

  const state = isAvailable
    ? 'Free'
    : isAllocated
      ? 'Reserved'
      : isBlocked
        ? 'Blocked'
        : 'Occupied';

  const box = isAvailable
    ? 'border-hair2 bg-panel2 bay-hatch'
    : isAllocated
      ? 'border-2 border-paint bg-panel2'
      : isBlocked
        ? 'border-2 border-fault border-dashed bg-panel'
        : 'border-2 border-ink bg-ink text-panel';

  const stateTone = isOccupied
    ? 'text-[#BCB6A7]'
    : isBlocked
      ? 'text-fault'
      : 'text-muted';

  const hasData = Boolean(plate || dwell || (isAllocated && since));

  return (
    <div className={`relative border-[1.5px] min-h-[104px] px-3 py-2.5 flex flex-col justify-between ${box}`}>
      {isAllocated && <span className="absolute inset-y-0 left-0 w-[5px] bg-paintDeep" />}

      <div>
        <div className="font-sign font-extrabold text-[30px] leading-none tracking-[-0.02em]">
          {slot.slot_number}
        </div>
        <div className={`text-[10px] uppercase tracking-[0.1em] mt-[3px] ${stateTone}`}>
          {state}
        </div>
      </div>

      {hasData && (
        <div className="flex items-baseline gap-2 mt-2">
          <span
            className={`mono text-[12.5px] tracking-[0.03em] ${
              isOccupied ? 'text-panel' : plate ? 'text-ink' : 'text-muted'
            }`}
          >
            {plate ?? (isAllocated ? 'held' : '')}
          </span>
          <span
            className={`mono text-[10.5px] whitespace-nowrap ml-auto ${
              isOccupied ? 'text-[#BCB6A7]' : 'text-muted'
            }`}
          >
            {dwell ?? (since ? `from ${since}` : '')}
          </span>
        </div>
      )}
    </div>
  );
};

export const ParkingLayout: React.FC<ParkingLayoutProps> = ({
  slots,
  entryBarrierOpen = false,
  exitBarrierOpen = false,
  loading = false,
}) => {
  const rowA = slots.filter((s) => s.slot_number.startsWith('A'));
  const rowB = slots.filter((s) => s.slot_number.startsWith('B'));

  return (
    <section className="card">
      <div className="card-head">
        <span className="kicker">Level 0</span>
        <span className="sign-title">Facility plan</span>
        <div className="ml-auto hidden sm:flex items-center gap-3.5 text-[11px] text-ink2">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-ink border border-ink" />
            Occupied
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-paint border border-paintDeep" />
            Reserved
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 border border-hair2 bay-hatch" />
            Free
          </span>
        </div>
      </div>

      <div className="px-3.5 pt-4 pb-1.5">
        <div className="flex items-center gap-2 mono text-[9.5px] uppercase tracking-[0.14em] text-muted mb-2">
          Zone A · Executive
          <span className="flex-1 h-px bg-hair" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-[repeat(3,1fr)_104px] gap-2.5 items-stretch">
          {rowA.map((slot) => (
            <Bay key={slot.id} slot={slot} />
          ))}
          <GateColumn label="Entry" open={entryBarrierOpen} />
        </div>

        <div className="col-span-full my-3 h-[34px] border-y border-dashed border-hair2 lane-ticks flex items-center justify-center gap-3 mono text-[9.5px] uppercase tracking-[0.16em] text-muted">
          <span>◀</span> Central driveway · 10 km/h <span>▶</span>
        </div>

        <div className="flex items-center gap-2 mono text-[9.5px] uppercase tracking-[0.14em] text-muted mb-2">
          Zone B · Standard
          <span className="flex-1 h-px bg-hair" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-[repeat(3,1fr)_104px] gap-2.5 items-stretch">
          {rowB.map((slot) => (
            <Bay key={slot.id} slot={slot} />
          ))}
          <GateColumn label="Exit" open={exitBarrierOpen} />
        </div>

        {loading && <div className="mono text-[11px] text-muted mt-3">Reading bay state…</div>}
      </div>
    </section>
  );
};
