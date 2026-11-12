import type { APIRoute } from 'astro';
import { recordEvent } from '../../lib/events';
import { back } from '../../lib/respond';
import { adminClient } from '../../lib/supabase';
import { ensureVisitorId } from '../../lib/visitor';

// Give an idea a heart, or take it back. No sign-in: one heart per browser per idea,
// keyed by a random id in a cookie. Clearing cookies gets you another, so hearts are
// an interest signal only. They carry no money and no weight in any prize.
export const POST: APIRoute = async (context) => {
  const { request, cookies, url } = context;
  const form = await request.formData();
  const slug = String(form.get('idea') ?? '');
  const from = form.get('from') === 'list' ? '/ideas' : `/ideas/${slug}`;
  if (!/^[a-z0-9-]{1,70}$/.test(slug)) return back('/ideas', 'idea_gone');
  const db = adminClient();
  if (!db) return back(from, 'save_failed');
  const { data: idea } = await db.from('ideas').select('id').eq('slug', slug).eq('status', 'listed').maybeSingle();
  if (!idea) return back('/ideas', 'idea_gone');

  const key = { idea_id: idea.id, visitor: ensureVisitorId(cookies, url.protocol === 'https:') };
  if (form.get('action') === 'unheart') {
    const { error } = await db.from('idea_hearts').delete().match(key);
    if (error) return back(from, 'save_failed');
  } else {
    const { data, error } = await db.from('idea_hearts').upsert(key, { ignoreDuplicates: true }).select('idea_id');
    if (error) return back(from, 'save_failed');
    // Only a heart that was not already there counts as something done.
    if (data?.length) await recordEvent(db, context, { kind: 'hearted', subject: slug });
  }
  return new Response(null, { status: 303, headers: { location: from } });
};
