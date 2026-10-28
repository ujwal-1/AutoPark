'use client';

import React, { useState } from 'react';

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
  availableSlots,
  loading,
}) => {
  const [selectedReleaseSlot, setSelectedReleaseSlot] = useState<string>('A1');

  return (
    <section className="card flex flex-col h-full">
      <div className="card-head">
        <span className="kicker">Bench</span>
        <span className="sign-title">Gate simulator</span>
        <span className="ml-auto mono text-[10.5px] text-muted">no hardware attached</span>
      </div>

      <div className="p-4 flex-1 flex flex-col gap-5">
        <p className="text-[12px] text-ink2 leading-relaxed">
          Drives the same endpoints the ESP32-CAM posts to. Entry reads a plate, matches it
          against an open booking, and lifts the barrier only on a match.
        </p>

        <div className="grid gap-2">
          <button
            onClick={() => onSimulateEntry(true)}
            disabled={loading}
            className="btn btn-solid w-full py-2.5"
          >
            Simulate booked entry
          </button>
          <button
            onClick={() => onSimulateEntry(false)}
            disabled={loading}
            className="btn w-full py-2.5 flex items-center justify-center gap-2"
          >
            <span className="w-1.5 h-1.5 bg-paintDeep" />
            Simulate unlisted plate
          </button>
          <button
            onClick={onSimulateExit}
            disabled={loading}
            className="btn w-full py-2.5"
          >
            Simulate exit
          </button>
        </div>

        <div className="border border-hair p-3">
          <label className="kicker block mb-2">Manual release</label>
          <div className="flex gap-2">
            <select
              value={selectedReleaseSlot}
              onChange={(e) => setSelectedReleaseSlot(e.target.value)}
              className="mono flex-1 bg-white border border-hair2 px-2.5 py-1.5 text-[12px] text-ink focus:outline-none focus:border-ink"
            >
              {['A1', 'A2', 'A3', 'B1', 'B2', 'B3'].map((slotNum) => (
                <option key={slotNum} value={slotNum}>
                  Bay {slotNum}
                </option>
              ))}
            </select>
            <button
              onClick={() => onManualReleaseSlot(selectedReleaseSlot)}
              disabled={loading}
              className="btn"
            >
              Release
            </button>
          </div>
          <p className="text-[10.5px] text-muted mt-2">
            {availableSlots.length === 0
              ? 'No bay is free.'
              : `Free now: ${availableSlots.join(', ')}`}
          </p>
        </div>

        <button
          onClick={onResetDemo}
          disabled={loading}
          className="btn btn-quiet mt-auto self-start"
        >
          Reset facility
        </button>
      </div>
    </section>
  );
};
