import type { APIRoute } from 'astro';
import { back, safeBack } from '../../lib/respond';
import { adminClient } from '../../lib/supabase';

// Follow someone, or stop following them. Any signed-in person can follow; you can't follow yourself.
export const POST: APIRoute = async ({ request, locals }) => {
  const form = await request.formData();
  const to = safeBack(form.get('back'));
  const person = locals.person;
  const db = adminClient();
  if (!person || !db) return back(to, 'need_signin');
  const target = String(form.get('person') ?? '');
  if (!/^[0-9a-f-]{36}$/.test(target) || target === person.id) return back(to, 'save_failed');
  const key = { follower_id: person.id, followee_id: target };
  const { error } = form.get('action') === 'unfollow'
    ? await db.from('follows').delete().match(key)
    : await db.from('follows').upsert(key, { ignoreDuplicates: true });
  if (error) return back(to, 'save_failed');
  return new Response(null, { status: 303, headers: { location: to } });
};
