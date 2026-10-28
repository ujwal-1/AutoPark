'use client';

import React from 'react';

interface NotificationBannerProps {
  /** Short boxed label on the left: "Attention", "Entry", "Fault". */
  label: string;
  /** Banner sentence. Emphasise the leading fact with <b>. */
  children: React.ReactNode;
  /** Optional primary action, e.g. jump to the gate that needs a look. */
  onReview?: () => void;
  reviewLabel?: string;
  onDismiss: () => void;
}

/**
 * The paint-yellow attention bar. One at a time, dismissed by the operator.
 * Used for refused entries and for the "bay assigned" confirmation.
 */
export const NotificationBanner: React.FC<NotificationBannerProps> = ({
  label,
  children,
  onReview,
  reviewLabel = 'Review',
  onDismiss,
}) => {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3.5 gap-y-2 bg-paint border border-[#CFAB6C] px-3.5 py-2.5">
      <span className="mono text-[10px] font-semibold uppercase tracking-[0.12em] border border-ink/45 px-1.5 py-0.5 text-ink shrink-0">
        {label}
      </span>
      <p className="text-[13px] text-ink leading-snug flex-1 min-w-[220px]">{children}</p>
      <div className="ml-auto flex items-center gap-2 shrink-0">
        {onReview && (
          <button onClick={onReview} className="btn btn-solid">
            {reviewLabel}
          </button>
        )}
        <button onClick={onDismiss} className="btn btn-quiet">
          Dismiss
        </button>
      </div>
    </div>
  );
};
