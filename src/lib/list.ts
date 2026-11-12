import type { SupabaseClient } from '@supabase/supabase-js';
import { deliver, welcomeEmail } from './email';

export type ListStatus = 'new' | 'existing' | 'unsubscribed' | 'failed';

/**
 * Adds an address to the email list and, if it is new, sends the welcome email.
 * An address that unsubscribed stays unsubscribed. Never throws.
 *
 * `personId` links the address to an account. Only the GitHub sign-in may pass it, with the
 * address GitHub itself gave: an address typed into a form is never tied to whoever typed it.
 * Rate limiting is the caller's job and happens before this is called.
 */
export async function addToList(
  db: SupabaseClient,
  input: { email: string; country: string | null } & ({ source: 'form' } | { source: 'github'; personId: string }),
): Promise<ListStatus> {
  const { data, error } = await db.rpc('subscribe', {
    p_email: input.email, p_source: input.source, p_person: input.source === 'github' ? input.personId : null,
    p_country: input.country, p_sender: null, p_max_per_hour: 1_000_000,
  });
  if (error || !data) return 'failed';
  const status = data.status as ListStatus;
  if (status === 'new' && typeof data.token === 'string') {
    const result = await deliver(db, welcomeEmail(input.email, data.token));
    if (result.sent) await db.from('subscribers').update({ welcomed_at: new Date().toISOString() }).eq('token', data.token);
  }
  return status === 'new' || status === 'existing' || status === 'unsubscribed' ? status : 'failed';
}
