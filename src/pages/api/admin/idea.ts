import type { APIRoute } from 'astro';
import { isAdmin } from '../../../lib/db';
import { parseIdea } from '../../../lib/forms';
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
  const { slug, code } = await storeIdea(db, parsed, null);
  return back(slug ? `/ideas/${slug}` : '/admin#ideas', code);
};
