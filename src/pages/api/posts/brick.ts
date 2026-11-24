import type { APIRoute } from 'astro';
import { back, safeBack } from '../../../lib/respond';
import { adminClient } from '../../../lib/supabase';

// "Lay a brick" on a post, or take it back. One per person per post. Any signed-in person can.
export const POST: APIRoute = async ({ request, locals }) => {
  const form = await request.formData();
  const to = safeBack(form.get('back'));
  const person = locals.person;
  const db = adminClient();
  if (!person || !db) return back(to, 'need_signin');
  const postId = String(form.get('post') ?? '');
  if (!/^[0-9a-f-]{36}$/.test(postId)) return back(to, 'post_gone');
  const key = { post_id: postId, person_id: person.id };
  const { error } = form.get('action') === 'unbrick'
    ? await db.from('post_bricks').delete().match(key)
    : await db.from('post_bricks').upsert(key, { ignoreDuplicates: true });
  if (error) return back(to, 'save_failed');
  return new Response(null, { status: 303, headers: { location: to } });
};
