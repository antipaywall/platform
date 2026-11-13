import type { APIRoute } from 'astro';
import { back, safeNext } from '../../../lib/respond';
import { adminClient } from '../../../lib/supabase';

// The person who offered it picks the new owner, or withdraws the offer.
export const POST: APIRoute = async ({ request, locals }) => {
  const form = await request.formData();
  const next = safeNext(String(form.get('next') ?? ''), '/');
  const person = locals.person;
  if (!person) return back(next, 'need_signin');
  const adoption = String(form.get('adoption_id') ?? '');
  const action = String(form.get('action') ?? '');
  const takenBy = String(form.get('taken_by') ?? '');
  if (!/^[0-9a-f-]{36}$/.test(adoption) || !['taken', 'withdrawn'].includes(action)) return back(next, 'save_failed');
  const db = adminClient();
  if (!db) return back(next, 'save_failed');
  const { data } = await db.from('adoptions').select('offered_by').eq('id', adoption).eq('status', 'open').maybeSingle();
  if (!data || data.offered_by !== person.id) return back(next, 'not_yours_to_offer');
  const update = action === 'taken' && /^[0-9a-f-]{36}$/.test(takenBy) ? { status: 'taken', taken_by: takenBy } : { status: 'withdrawn' };
  const { error } = await db.from('adoptions').update({ ...update, updated_at: new Date().toISOString() }).eq('id', adoption);
  return back(next, error ? 'save_failed' : action === 'taken' ? 'handed_off' : 'done');
};
