import type { APIRoute } from 'astro';
import { back, safeBack } from '../../../lib/respond';
import { adminClient } from '../../../lib/supabase';

// Reports a post or reply to the organizer. One report per person per post.
export const POST: APIRoute = async ({ request, locals }) => {
  const form = await request.formData();
  const to = safeBack(form.get('back'));
  const person = locals.person;
  const db = adminClient();
  if (!person || !db) return back(to, 'need_signin');
  const postId = String(form.get('post') ?? '');
  if (!/^[0-9a-f-]{36}$/.test(postId)) return back(to, 'post_gone');
  const reason = String(form.get('reason') ?? '').trim().slice(0, 300) || null;
  const { error } = await db.from('post_reports').upsert({ post_id: postId, reporter_id: person.id, reason }, { onConflict: 'post_id,reporter_id' });
  return back(to, error ? 'save_failed' : 'reported');
};
