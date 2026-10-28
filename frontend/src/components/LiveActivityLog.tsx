'use client';

import React from 'react';
import { ActivityEvent } from '../lib/types';

interface LiveActivityLogProps {
  events: ActivityEvent[];
}

const isFault = (type: string) => type === 'unauthorized' || type === 'full';

export const LiveActivityLog: React.FC<LiveActivityLogProps> = ({ events }) => {
  return (
    <section className="card flex flex-col">
      <div className="card-head">
        <span className="kicker">Log</span>
        <span className="sign-title">Gateway activity</span>
        <span className="ml-auto mono text-[10.5px] text-muted">
          {events.length === 0 ? 'nothing yet' : `${events.length} entries`}
        </span>
      </div>

      <div className="max-h-[352px] overflow-y-auto">
        {events.length === 0 ? (
          <p className="px-3.5 py-8 text-[12.5px] text-muted">
            No sessions yet today. Entries appear here as they happen.
          </p>
        ) : (
          <ul>
            {events.map((evt) => (
              <li
                key={evt.id}
                className={`grid grid-cols-[46px_1fr] gap-3 px-3.5 py-2 border-b border-hair last:border-b-0 ${
                  isFault(evt.type) ? 'border-l-2 border-l-fault pl-2.5' : ''
                }`}
              >
                <span className="mono text-[11px] text-muted pt-[1px] tabular-nums">
                  {String(evt.timestamp).slice(0, 5)}
                </span>
                <p className="text-[12.5px] text-ink2 leading-snug">
                  {evt.message}
                  {evt.slot && (
                    <span className="mono text-[11.5px] text-ink"> · bay {evt.slot}</span>
                  )}
                  {evt.plate_number && (
                    <span className="mono text-[11.5px] text-ink"> · {evt.plate_number}</span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-hair px-3.5 py-1.5 flex items-center justify-between mono text-[9.5px] uppercase tracking-[0.12em] text-muted">
        <span>Audit trail</span>
        <span>WebSocket</span>
      </div>
    </section>
  );
};
