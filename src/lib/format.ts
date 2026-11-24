// Small ways of writing numbers and times on the directory's pages.

/** 950, 3.6k, 38k, 1.3M. */
export function shortCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "2 hours ago", "yesterday", "3 days ago", "3 months ago". */
export function timeAgo(iso: string | null | undefined, now: Date): string {
  if (!iso) return 'never';
  const ms = now.getTime() - Date.parse(iso);
  if (Number.isNaN(ms)) return 'never';
  if (ms < 5 * MIN) return 'just now';
  if (ms < HOUR) return `${Math.round(ms / MIN)} minutes ago`;
  if (ms < DAY) { const h = Math.round(ms / HOUR); return h === 1 ? 'an hour ago' : `${h} hours ago`; }
  if (ms < 2 * DAY) return 'yesterday';
  if (ms < 45 * DAY) return `${Math.round(ms / DAY)} days ago`;
  if (ms < 365 * DAY) { const m = Math.round(ms / (30.44 * DAY)); return m === 1 ? 'a month ago' : `${m} months ago`; }
  const y = Math.floor(ms / (365.25 * DAY));
  return y === 1 ? 'a year ago' : `${y} years ago`;
}

/** "today" or "3 days ago" style, for "updated" tags. */
export const updated = (iso: string | null | undefined, now: Date) => {
  const t = timeAgo(iso, now);
  return t === 'just now' || /minutes|hour/.test(t) ? 'today' : t;
};

/** Dollars from cents: $5, $5.50, $1,200. */
export const dollars = (cents: number) => '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 });

/** An issue title without the emoji and bracketed labels some projects put in front ("🐛 [Bug] …"). */
export function cleanIssueTitle(t: string): string {
  const out = t
    .replace(/\p{Extended_Pictographic}️?/gu, ' ')
    .replace(/^\s*(?:[[(][^\])]{1,24}[\])]\s*:?\s*)+/u, '')
    .replace(/^\s*[A-Za-z]{2,12}:\s+/, (m) => (/^(bug|feat|feature|fix|docs|chore|enhancement|request|idea|question)/i.test(m) ? '' : m))
    .replace(/\s+/g, ' ')
    .trim();
  if (!out) return t.trim();
  // Only tidy the first letter when something was taken off the front.
  return out === t.trim() ? out : out.charAt(0).toUpperCase() + out.slice(1);
}

/** A GitHub description as people read it: no :emoji: shortcodes, no words repeated three times over. */
export function cleanDescription(d: string | null | undefined): string | null {
  if (!d) return null;
  const out = d
    .replace(/:[a-z0-9_+-]{2,30}:/g, ' ')
    .replace(/\b(\w+)(?:\s+\1\b){1,}/gi, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return out || null;
}
