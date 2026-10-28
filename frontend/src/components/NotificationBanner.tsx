'use client';

import React from 'react';
import { X } from 'lucide-react';

interface NotificationBannerProps {
  allocatedSlot: string | null;
  vehicleType: string;
  plateNumber?: string | null;
  triggerBuzzer: boolean;
  onDismiss: () => void;
}

export const NotificationBanner: React.FC<NotificationBannerProps> = ({
  allocatedSlot,
  vehicleType,
  plateNumber,
  onDismiss,
}) => {
  if (!allocatedSlot) return null;

  return (
    <div className="mb-4 flex items-center gap-3 bg-paint border border-paintDeep px-3.5 py-2.5">
      <span className="mono text-[9.5px] uppercase tracking-[0.12em] border border-ink/40 px-1.5 py-0.5 text-ink">
        Entry
      </span>
      <p className="text-[13px] text-ink">
        <b className="font-semibold">Bay {allocatedSlot}</b> assigned
        {plateNumber && <span className="mono"> · {plateNumber}</span>}
        <span className="text-ink2">
          {' '}
          · {(vehicleType || 'vehicle').replace('_', ' ')} · barrier up
        </span>
      </p>
      <button
        onClick={onDismiss}
        className="ml-auto text-[11.5px] text-ink2 hover:text-ink inline-flex items-center gap-1 px-1.5 py-0.5"
      >
        <X className="w-3.5 h-3.5" />
        Dismiss
      </button>
    </div>
  );
};
