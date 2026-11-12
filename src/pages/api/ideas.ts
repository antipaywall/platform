import type { APIRoute } from 'astro';
import { site } from '../../config/site';
import { recordEvent } from '../../lib/events';
import { parseIdea } from '../../lib/forms';
import { storeIdea } from '../../lib/postIdea';
import { back } from '../../lib/respond';
import { adminClient } from '../../lib/supabase';

export const POST: APIRoute = async (context) => {
  const { request, locals } = context;
  const person = locals.person;
  const db = adminClient();
  if (!person || !db) return back('/ideas/new', 'need_signin');
  const form = await request.formData();
  const parsed = parseIdea({ title: form.get('title'), pitch: form.get('pitch'), missing: form.get('missing') });
  if (!parsed.ok) return back('/ideas/new', parsed.error);

  // Only this person's own ideas count toward their limit. Ideas the platform posted have no author.
  const mine = await db.from('ideas').select('id', { count: 'exact', head: true }).eq('author_id', person.id).eq('status', 'listed');
  if (mine.error) return back('/ideas/new', 'save_failed');
  if ((mine.count ?? 0) >= site.ideas.maxPerPerson) return back('/ideas/new', 'too_many_ideas');

  const { slug, code } = await storeIdea(db, parsed, person.id);
  if (slug) await recordEvent(db, context, { kind: 'idea_posted', personId: person.id, subject: slug });
  return back(slug ? `/ideas/${slug}` : '/ideas/new', code);
};
