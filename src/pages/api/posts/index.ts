import type { APIRoute } from 'astro';
import { parsePost } from '../../../lib/forms';
import { back, safeBack } from '../../../lib/respond';
import { postedToday, POSTS_PER_DAY, REPLIES_PER_DAY } from '../../../lib/social';
import { adminClient } from '../../../lib/supabase';

// Writes a post, or a reply to one. Posting needs the two builder checks, the same protection
// against throwaway accounts as the builder count, and is limited per day.
export const POST: APIRoute = async ({ request, locals }) => {
  const form = await request.formData();
  const to = safeBack(form.get('back'));
  const person = locals.person;
  const db = adminClient();
  if (!person || !db) return back(to, 'need_signin');
  if (!person.verified) return back(to, 'need_checks');
  if (person.can_post === false) return back(to, 'posting_off');
  const parentId = form.get('parent');
  const reply = typeof parentId === 'string' && parentId.length > 0;
  if (reply && !/^[0-9a-f-]{36}$/.test(parentId)) return back(to, 'post_gone');
  const parsed = parsePost({ kind: form.get('kind'), body: form.get('body'), link: form.get('link') }, reply);
  if (!parsed.ok) return back(to, parsed.error);
  try {
    if ((await postedToday(person.id, reply)) >= (reply ? REPLIES_PER_DAY : POSTS_PER_DAY)) return back(to, reply ? 'too_many_replies' : 'too_many_posts');
  } catch {
    return back(to, 'save_failed');
  }
  if (reply) {
    const { data: parent } = await db.from('posts').select('id').eq('id', parentId).is('parent_id', null).is('hidden_at', null).maybeSingle();
    if (!parent) return back(to, 'post_gone');
  }
  const { error } = await db.from('posts').insert({
    person_id: person.id, parent_id: reply ? parentId : null,
    kind: parsed.post.kind, body: parsed.post.body, link_url: parsed.post.linkUrl,
  });
  return back(to, error ? 'save_failed' : reply ? 'replied' : 'posted');
};
