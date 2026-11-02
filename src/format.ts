const intFmt = new Intl.NumberFormat('en-IN');
const compactFmt = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

export const fmtInt = (n: number | null | undefined) => (n == null ? '–' : intFmt.format(n));
export const fmtCompact = (n: number | null | undefined) => (n == null ? '–' : compactFmt.format(n));

export const fmtX = (n: number | null | undefined) => {
  if (n == null) return '–';
  return `${n >= 10 ? n.toFixed(0) : n.toFixed(1)}×`;
};

/** A 0–1 confidence as a whole percent: 0.9 → "90%". */
const GENERIC_ERROR = 'Something went wrong on our side. Please try again, and tell the team if it keeps happening.';

/**
 * A message safe to show people. The API already sends plain sentences; this is the safety net for
 * anything that still looks technical (status codes, class names, JSON), which is replaced.
 */
export function readableError(message: string | null | undefined): string {
  if (!message) return GENERIC_ERROR;
  const technical = /Traceback|\b[A-Z][A-Za-z]+(Error|Exception)\b|[{}[\]]|\b[1-5]\d\d [A-Z_]{3,}/.test(message);
  return technical ? GENERIC_ERROR : message;
}

/** `readableError` for anything a try/catch caught. */
export const errorText = (err: unknown, fallback?: string) =>
  readableError(err instanceof Error ? err.message : fallback ?? String(err));

export const fmtPct = (n: number | null | undefined) => (n == null ? '–' : `${Math.round(n * 100)}%`);

export const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

export const fmtShortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export const fmtDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '–';

export const timeAgo = (iso: string | null) => {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** "Today", "Yesterday" or "Mon, 26 Oct" for a snapshot day. */
export const dayLabel = (iso: string | null) => {
  if (!iso) return 'No data';
  const diff = Math.round((new Date(`${isoToday()}T00:00:00`).getTime() - new Date(`${iso}T00:00:00`).getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return fmtDay(iso);
};

/** "2d ago", "18h ago" for a post's age in days. */
export const ageAgo = (days: number) => `${ageShort(days)} ago`;

/** "11d" / "44h", where a label already says it's an age. */
export const ageShort = (days: number) => (days < 2 ? `${Math.max(1, Math.round(days * 24))}h` : `${Math.round(days)}d`);

/** "an 11-day-old" / "a 20-hour-old", for "usual views for an 11-day-old reel". */
export const ageAdjective = (days: number) => {
  const n = days < 2 ? Math.max(1, Math.round(days * 24)) : Math.round(days);
  const vowelSound = String(n).startsWith('8') || n === 11 || n === 18; // "an eight", "an eleven"
  return `${vowelSound ? 'an' : 'a'} ${n}-${days < 2 ? 'hour' : 'day'}-old`;
};

/** "Creator collab" or "Own post", plus the media type when it isn't a reel. */
export const typeLabel = (p: { is_collab: boolean; media_type: string }) =>
  `${p.is_collab ? 'Creator collab' : 'Own post'}${p.media_type === 'reel' ? '' : ` · ${p.media_type}`}`;

export type Result = 'Scored · trending' | 'Scored · watch' | 'Scored · not trending' | 'Not scored';
export const WATCH_MIN = 1.5;

/** The four buckets the post library filters on. */
export const resultOf = (p: { trending: boolean; scored: boolean; outperformance: number | null }): Result => {
  if (p.trending) return 'Scored · trending';
  if (!p.scored) return 'Not scored';
  return (p.outperformance ?? 0) >= WATCH_MIN ? 'Scored · watch' : 'Scored · not trending';
};
