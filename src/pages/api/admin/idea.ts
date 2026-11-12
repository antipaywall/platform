import type { APIRoute } from 'astro';
import { isAdmin } from '../../../lib/db';
import { parseIdea, parseWriteup } from '../../../lib/forms';
import { storeIdea } from '../../../lib/postIdea';
import { back } from '../../../lib/respond';
import { adminClient } from '../../../lib/supabase';

// Posts an idea with no personal author, shown as "Posted by Antipaywall". Organizer only.
export const POST: APIRoute = async ({ request, locals }) => {
  if (!isAdmin(locals.person)) return new Response(null, { status: 404 });
  const db = adminClient();
  if (!db) return back('/admin#ideas', 'save_failed');
  const form = await request.formData();
  const parsed = parseIdea({ title: form.get('title'), pitch: form.get('pitch'), missing: form.get('missing') });
  if (!parsed.ok) return back('/admin#ideas', parsed.error);
  const writeup = parseWriteup({ problem: form.get('problem'), build: form.get('build'), strong: form.get('strong'), sourceUrl: form.get('source_url'), search: form.get('search') });
  if (!writeup.ok) return back('/admin#ideas', writeup.error);
  const { slug, code } = await storeIdea(db, parsed, null, writeup);
  return back(slug ? `/ideas/${slug}` : '/admin#ideas', code);
};
