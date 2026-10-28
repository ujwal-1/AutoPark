'use client';

import React from 'react';
import { ParkingSlotData } from '../lib/types';
import { clockTime, dwellSince, listBays } from '../lib/time';

interface SessionsTableProps {
  slots: ParkingSlotData[];
  onRelease: (slotNumber: string) => void;
}

const stateFor = (slot: ParkingSlotData) => {
  switch (slot.status) {
    case 'OCCUPIED':
      return { label: 'Occupied', pill: 'pill-occupied' };
    case 'ALLOCATED':
      return { label: 'Reserved', pill: 'pill-reserved' };
    case 'BLOCKED':
    case 'MAINTENANCE':
      return { label: 'Blocked', pill: 'pill-fault' };
    default:
      return { label: 'Free', pill: '' };
  }
};

/**
 * "Open now" — one row per bay that is not free. The counts in the header come
 * from the same slot list the plan uses, so the two cannot disagree.
 */
export const SessionsTable: React.FC<SessionsTableProps> = ({ slots, onRelease }) => {
  const open = slots
    .filter((s) => s.status !== 'AVAILABLE')
    .slice()
    .sort((a, b) => a.slot_number.localeCompare(b.slot_number));

  const freeBays = slots
    .filter((s) => s.status === 'AVAILABLE')
    .map((s) => s.slot_number)
    .sort((a, b) => a.localeCompare(b));

  return (
    <section className="card">
      <div className="card-head">
        <span className="kicker">Sessions</span>
        <span className="sign-title">Open now</span>
        <span className="ml-auto mono text-[10.5px] text-muted">
          {open.length} open · {slots.length} bays
        </span>
      </div>

      {open.length === 0 ? (
        <p className="px-3.5 py-8 text-[12.5px] text-muted">
          No bay is in use. All {slots.length} bays are free.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-[70px]">Bay</th>
                <th className="w-[120px]">State</th>
                <th>Plate</th>
                <th className="w-[80px]">Since</th>
                <th className="w-[80px] r">Dwell</th>
                <th className="w-[86px]" />
              </tr>
            </thead>
            <tbody>
              {open.map((slot) => {
                const state = stateFor(slot);
                const since = clockTime(slot.active_session?.entry_time);
                const dwell =
                  slot.status === 'OCCUPIED' ? dwellSince(slot.active_session?.entry_time) : null;

                return (
                  <tr key={slot.id}>
                    <td>
                      <span className="bay-no">{slot.slot_number}</span>
                    </td>
                    <td>
                      <span className={`pill ${state.pill}`}>{state.label}</span>
                    </td>
                    <td>
                      <span className="mono text-[12px] tracking-[0.03em]">
                        {slot.active_session?.plate_number ?? '—'}
                      </span>
                    </td>
                    <td>
                      <span className="mono text-[11.5px] tabular-nums text-ink2">
                        {since ?? '—'}
                      </span>
                    </td>
                    <td className="r">
                      <span className={`mono text-[11.5px] tabular-nums ${dwell ? 'text-ink2' : 'text-muted'}`}>
                        {dwell ?? '—'}
                      </span>
                    </td>
                    <td className="r">
                      <button
                        onClick={() => onRelease(slot.slot_number)}
                        className="btn btn-quiet"
                      >
                        Release
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="px-3.5 py-2.5 border-t border-hair text-[11px] text-muted leading-relaxed">
        {freeBays.length > 0
          ? `${listBays(freeBays)} ${freeBays.length === 1 ? 'is' : 'are'} empty. `
          : 'Every bay is in use. '}
        Occupied bays close when the exit camera reads the plate; a reservation holds its bay
        until the driver arrives.
      </p>
    </section>
  );
};
