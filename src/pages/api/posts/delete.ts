import type { APIRoute } from 'astro';
import { back, safeBack } from '../../../lib/respond';
import { adminClient } from '../../../lib/supabase';

// Deletes one of your own posts or replies. Replies to a deleted post go with it.
export const POST: APIRoute = async ({ request, locals }) => {
  const form = await request.formData();
  const to = safeBack(form.get('back'));
  const person = locals.person;
  const db = adminClient();
  if (!person || !db) return back(to, 'need_signin');
  const postId = String(form.get('post') ?? '');
  if (!/^[0-9a-f-]{36}$/.test(postId)) return back(to, 'post_gone');
  const { error } = await db.from('posts').delete().eq('id', postId).eq('person_id', person.id);
  return back(to, error ? 'save_failed' : 'post_deleted');
};
