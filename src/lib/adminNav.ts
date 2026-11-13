// The organizer's pages, in the order they are shown. Each page checks who is asking before
// anything else; this list only draws the links between them.
export const ADMIN_SECTIONS = [
  { path: '/admin', label: 'Overview' },
  { path: '/admin/visitors', label: 'Visitors' },
  { path: '/admin/people', label: 'People' },
  { path: '/admin/manage', label: 'Inbox and moderation' },
  { path: '/admin/community', label: 'Posts and badges' },
] as const;

/** A time as "Nov 12, 14:05", in UTC, which is how the database counts days. */
export function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
}

/** Just the clock time, in UTC. */
export function clock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'UTC' });
}
