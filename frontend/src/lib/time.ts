/** Time helpers shared by the console plan and the open-sessions table. */

/**
 * The API stores naive UTC timestamps ("2026-10-29T02:58:00.123456"). Parsing
 * those with `new Date()` would treat them as local time, so pin them to UTC
 * unless the string already carries an offset.
 */
const parseStamp = (iso: string): number => {
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(iso);
  const normalised = hasZone ? iso : `${iso}Z`;
  return new Date(normalised).getTime();
};

/** "21:40" from an ISO timestamp, or null when the value is missing/invalid. */
export const clockTime = (iso?: string | null): string | null => {
  if (!iso) return null;
  const ms = parseStamp(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

/** "1h 33m" (or "48m" under an hour) between an ISO timestamp and now. */
export const dwellSince = (iso?: string | null): string | null => {
  if (!iso) return null;
  const start = parseStamp(iso);
  if (Number.isNaN(start)) return null;
  const mins = Math.max(0, Math.floor((Date.now() - start) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
};

/** "B1, B2 and B3" — used in the sentence under the sessions table. */
export const listBays = (bays: string[]): string => {
  if (bays.length === 0) return 'none';
  if (bays.length === 1) return bays[0];
  return `${bays.slice(0, -1).join(', ')} and ${bays[bays.length - 1]}`;
};
