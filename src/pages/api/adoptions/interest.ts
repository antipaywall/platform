import type { APIRoute } from 'astro';
import { back, safeNext } from '../../../lib/respond';
import { adminClient } from '../../../lib/supabase';

// "I'd take it over", or take that back. Builders only.
export const POST: APIRoute = async ({ request, locals }) => {
  const form = await request.formData();
  const next = safeNext(String(form.get('next') ?? ''), '/');
  const person = locals.person;
  if (!person) return back(next, 'need_signin');
  const adoption = String(form.get('adoption_id') ?? '');
  if (!/^[0-9a-f-]{36}$/.test(adoption)) return back(next, 'save_failed');
  const db = adminClient();
  if (!db) return back(next, 'save_failed');
  const key = { adoption_id: adoption, person_id: person.id };
  if (form.get('on') === '0') {
    await db.from('adoption_interest').delete().match(key);
    return back(next, 'done');
  }
  const note = String(form.get('note') ?? '').replace(/\s+/g, ' ').trim().slice(0, 300) || null;
  const { error } = await db.from('adoption_interest').upsert({ ...key, note });
  return back(next, error ? 'save_failed' : 'interest_sent');
};
