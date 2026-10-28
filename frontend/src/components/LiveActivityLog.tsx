'use client';

import React from 'react';
import { ActivityEvent } from '../lib/types';

interface LiveActivityLogProps {
  events: ActivityEvent[];
}

const dotFor = (type: string) => {
  switch (type) {
    case 'allocated':
    case 'barrier':
      return 'bg-ok';
    case 'released':
    case 'exited':
      return 'bg-ink';
    case 'unauthorized':
    case 'full':
      return 'bg-fault';
    case 'buzzer':
      return 'bg-paintDeep';
    case 'reset':
      return 'bg-hair2';
    default:
      return 'bg-hair2';
  }
};

export const LiveActivityLog: React.FC<LiveActivityLogProps> = ({ events }) => {
  return (
    <section className="card flex flex-col h-full">
      <div className="card-head">
        <span className="kicker">Log</span>
        <span className="sign-title">Gateway activity</span>
        <span className="ml-auto mono text-[10.5px] text-muted">
          {events.length === 0 ? 'nothing yet' : `${events.length} entries`}
        </span>
      </div>

      <div className="flex-1 max-h-[330px] overflow-y-auto">
        {events.length === 0 ? (
          <div className="px-4 py-8 text-[12px] text-muted">
            No sessions yet today. Entries appear here as they happen.
          </div>
        ) : (
          <ul>
            {events.map((evt) => (
              <li
                key={evt.id}
                className="grid grid-cols-[52px_8px_1fr] gap-2.5 items-start px-4 py-2 border-b border-hair last:border-b-0"
              >
                <span className="mono text-[10.5px] text-muted pt-[1px]">
                  {String(evt.timestamp).slice(0, 5)}
                </span>
                <span className={`w-1.5 h-1.5 rounded-full mt-[5px] ${dotFor(evt.type)}`} />
                <div className="text-[12px] text-ink2 leading-snug">
                  {evt.message}
                  {evt.slot && (
                    <span className="mono text-[11px] text-ink"> · bay {evt.slot}</span>
                  )}
                  {evt.plate_number && (
                    <span className="mono text-[11px] text-ink"> · {evt.plate_number}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-hair px-4 py-1.5 flex items-center justify-between mono text-[9.5px] uppercase tracking-[0.12em] text-muted">
        <span>Audit trail</span>
        <span>WebSocket</span>
      </div>
    </section>
  );
};
