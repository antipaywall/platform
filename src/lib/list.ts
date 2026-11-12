import type { SupabaseClient } from '@supabase/supabase-js';
import type { APIContext } from 'astro';
import { deliver, welcomeEmail } from './email';
import { recordEvent } from './events';

export type ListStatus = 'new' | 'existing' | 'unsubscribed' | 'failed';

/**
 * Adds an address to the email list and, if it is new, sends the welcome email.
 * An address that unsubscribed stays unsubscribed. Never throws. `id` is the new list entry's
 * id, and is only given when the address was new.
 *
 * `personId` links the address to an account. Only a GitHub or GitLab sign-in may pass it, with the
 * address that provider itself gave: an address typed into a form is never tied to whoever typed it.
 * Rate limiting is the caller's job and happens before this is called.
 */
export async function addToList(
  db: SupabaseClient,
  input: { email: string; country: string | null } & ({ source: 'form' } | { source: 'github' | 'gitlab'; personId: string }),
): Promise<{ status: ListStatus; id: string | null }> {
  const { data, error } = await db.rpc('subscribe', {
    p_email: input.email, p_source: input.source, p_person: input.source === 'form' ? null : input.personId,
    p_country: input.country, p_sender: null, p_max_per_hour: 1_000_000,
  });
  if (error || !data) return { status: 'failed', id: null };
  const status = data.status as ListStatus;
  let id: string | null = null;
  if (status === 'new' && typeof data.token === 'string') {
    // The list entry's own id, so the action can be recorded without the address.
    id = (await db.from('subscribers').select('id').eq('token', data.token).maybeSingle()).data?.id ?? null;
    const result = await deliver(db, welcomeEmail(input.email, data.token));
    if (result.sent) await db.from('subscribers').update({ welcomed_at: new Date().toISOString() }).eq('token', data.token);
  }
  return { status: status === 'new' || status === 'existing' || status === 'unsubscribed' ? status : 'failed', id };
}

/**
 * Takes the address behind this token off the list. Recorded as something done only when it
 * changes anything: an address already off the list, or a token that matches nothing, is not.
 * `fromMailApp` is for a mail app's own unsubscribe button, which is not the reader's browser.
 */
export async function leaveList(db: SupabaseClient, context: Pick<APIContext, 'request' | 'clientAddress'>, token: string, fromMailApp: boolean): Promise<void> {
  const before = await db.from('subscribers').select('id, person_id, unsubscribed_at').eq('token', token).maybeSingle();
  const { error } = await db.rpc('unsubscribe', { p_token: token });
  if (error || !before.data || before.data.unsubscribed_at) return;
  await recordEvent(db, context, { kind: 'unsubscribed', personId: before.data.person_id, subject: before.data.id, anonymous: fromMailApp, organizer: false });
}
