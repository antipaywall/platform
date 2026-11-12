import { createHmac } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

// Limits on how often one connection, or one person, can do something that costs us:
// add an address, send an inquiry, trigger an email. The record of each attempt is a
// row of (kind, key, time) and nothing else. It is deleted after a day.

/**
 * The key a connection is limited by, for one day. It is made from the day and the IP
 * address only, with its own label mixed in, so it is unrelated to the page-view visitor
 * code even though both use the same server key. The browser name is deliberately left
 * out: changing it must not buy a fresh allowance.
 */
export function rateKey(key: string, day: string, ip: string): string {
  return createHmac('sha256', key).update(`rate-limit\n${day}\n${ip}`).digest('hex').slice(0, 24);
}

export type Slot = 'ok' | 'limited' | 'error';

/** Takes one slot for (kind, key). 'limited' means the hourly allowance is used up; nothing was recorded. */
export async function takeSlot(db: SupabaseClient, kind: string, key: string, max: number): Promise<Slot> {
  const { data, error } = await db.rpc('take_slot', { p_kind: kind, p_key: key, p_max: max });
  if (error || typeof data !== 'boolean') return 'error';
  return data ? 'ok' : 'limited';
}

/** New addresses one connection may add to the email list in an hour. */
export const MAX_SUBSCRIBES_PER_HOUR = 5;
/** Sponsor inquiries one connection may send in an hour. */
export const MAX_INQUIRIES_PER_HOUR = 3;
/** Panel applications or organize offers one signed-in person may send in an hour. */
export const MAX_NOTES_PER_HOUR = 5;
/** Emails the whole site may send in an hour. Past this, submissions are still saved; the email is skipped. */
export const MAX_EMAILS_PER_HOUR = 60;
