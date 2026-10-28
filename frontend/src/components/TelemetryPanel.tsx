'use client';

import React from 'react';

/**
 * Measurement panel. Every value is deliberately "not measured" until the
 * timing harness has been run — nothing here is estimated.
 */
export const TelemetryPanel: React.FC = () => {
  const rows = [
    { label: 'Plate recognition accuracy', value: 'not measured' },
    { label: 'End-to-end latency', value: 'not measured' },
    { label: 'Test bench H1–H7', value: 'not run' },
  ];

  return (
    <section className="card">
      <div className="card-head">
        <span className="kicker">Telemetry</span>
        <span className="sign-title">Measurement</span>
      </div>

      <div className="px-3.5 py-3 grid gap-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 text-[12px]">
            <span className="text-ink2">{row.label}</span>
            <span className="mono text-[10px] uppercase tracking-[0.09em] text-muted border border-hair2 px-1.5 py-0.5">
              {row.value}
            </span>
          </div>
        ))}
        <p className="text-[11px] text-muted leading-relaxed border-t border-hair pt-2 mt-0.5">
          Filled from the timing harness once the bench runs. Not estimated.
        </p>
      </div>
    </section>
  );
};
