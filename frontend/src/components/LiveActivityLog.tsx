'use client';

import React from 'react';
import { ActivityEvent } from '../lib/types';
import { ListFilter, Bell, CheckCircle, Car, ArrowRightLeft, AlertOctagon, RotateCcw, AlertTriangle, Layers } from 'lucide-react';

interface LiveActivityLogProps {
  events: ActivityEvent[];
}

export const LiveActivityLog: React.FC<LiveActivityLogProps> = ({ events }) => {
  const getEventIcon = (type: string) => {
    switch (type) {
      case 'allocated':    return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case 'released':
      case 'exited':       return <ArrowRightLeft className="w-4 h-4 text-zinc-300" />;
      case 'buzzer':       return <Bell className="w-4 h-4 text-amber-400" />;
      case 'full':         return <AlertOctagon className="w-4 h-4 text-rose-400" />;
      case 'unauthorized': return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      case 'booking':      return <Layers className="w-4 h-4 text-white" />;
      case 'barrier':      return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case 'reset':        return <RotateCcw className="w-4 h-4 text-zinc-400" />;
      default:             return <Car className="w-4 h-4 text-zinc-400" />;
    }
  };

  return (
    <div className="district-card p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/[0.08]">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <ListFilter className="w-4 h-4 text-zinc-400" />
          Live Booking &amp; Activity Feed
        </h2>
        <span className="text-[11px] font-mono font-bold text-zinc-400 px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/10">
          Log ({events.length})
        </span>
      </div>

      <div className="flex-1 space-y-2.5 max-h-[310px] overflow-y-auto pr-1">
        {events.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 text-xs italic bg-[#18181B] rounded-2xl border border-white/5 border-dashed">
            No parking events yet. Perform an entry or click a simulation button.
          </div>
        ) : (
          events.map((evt) => (
            <div
              key={evt.id}
              className="p-3 rounded-xl bg-[#18181B] border border-white/10 hover:border-white/20 transition-colors flex items-center justify-between text-xs"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                  {getEventIcon(evt.type)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-white">{evt.message}</p>
                    {evt.plate_number && (
                      <span className="px-2 py-0.5 bg-black text-white font-mono font-bold text-[10px] rounded border border-white/20">
                        {evt.plate_number}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono">{evt.timestamp}</span>
                </div>
              </div>

              {evt.slot && (
                <span className="px-2.5 py-1 rounded-full bg-white/5 text-zinc-300 font-mono font-bold text-[11px] border border-white/10">
                  Bay {evt.slot}
                </span>
              )}
            </div>
          ))
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-[10px] text-zinc-500 font-mono">
        <span>AutoPark Telemetry Audit</span>
        <span>WebSocket Stream</span>
      </div>
    </div>
  );
};
