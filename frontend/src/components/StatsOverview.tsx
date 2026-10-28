'use client';

import React from 'react';
import { ParkingSummary } from '../lib/types';

interface StatsOverviewProps {
  summary: ParkingSummary;
}

const Cell: React.FC<{
  label: string;
  value: number;
  note?: string;
  dot?: string;
  emphasis?: boolean;
}> = ({ label, value, note, dot, emphasis }) => (
  <div className="px-4 sm:px-5 py-3 flex items-baseline justify-between gap-3">
    <div>
      <div className="flex items-center gap-1.5">
        {dot && <span className={`w-1.5 h-1.5 ${dot}`} />}
        <span className="kicker">{label}</span>
      </div>
      <div
        className={`mono text-[26px] leading-none mt-2 ${
          emphasis ? 'text-ink' : 'text-ink2'
        }`}
      >
        {value}
      </div>
      {note && <div className="text-[10.5px] text-muted mt-1.5">{note}</div>}
    </div>
  </div>
);

export const StatsOverview: React.FC<StatsOverviewProps> = ({ summary }) => {
  const inUse = summary.total_slots - summary.available;

  return (
    <div className="card grid grid-cols-2 md:grid-cols-4 divide-x divide-hair">
      <Cell
        label="Bays"
        value={summary.total_slots}
        note="A1–A3 · B1–B3"
        emphasis
      />
      <Cell
        label="Available"
        value={summary.available}
        dot="bg-ok"
        note={`${inUse} of ${summary.total_slots} in use`}
      />
      <Cell
        label="Reserved"
        value={summary.allocated}
        dot="bg-paintDeep"
        note="Held for a booking"
      />
      <Cell
        label="Occupied"
        value={summary.occupied}
        dot="bg-ink"
        note="Vehicle inside"
      />
    </div>
  );
};
