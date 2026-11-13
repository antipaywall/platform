import type { APIRoute } from 'astro';
import { site } from '../../config/site';
import { recordEvent } from '../../lib/events';
import { parseIdea } from '../../lib/forms';
import { storeIdea } from '../../lib/postIdea';
import { pushNewIdea } from '../../lib/ideasSync';
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

  // The paid products it replaces, picked from the matches shown while typing. Only real ones are kept.
  const picked = form.getAll('products').map(String).filter((s) => /^[a-z0-9-]{1,60}$/.test(s)).slice(0, 5);
  const productIds = picked.length ? ((await db.from('products').select('id').in('slug', picked)).data ?? []).map((p) => p.id as string) : [];

  const { slug, code } = await storeIdea(db, parsed, person.id, undefined, { productIds });
  if (slug) await recordEvent(db, context, { kind: 'idea_posted', personId: person.id, subject: slug });
  // The idea also becomes a file in the public ideas repo, credited to the person who posted it.
  if (slug) await pushNewIdea(db, slug, { login: person.username!, githubId: person.github_id }).catch(() => false);
  return back(slug ? `/ideas/${slug}` : '/ideas/new', code);
};
