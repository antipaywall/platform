import type { APIRoute } from 'astro';
import { parseFeatured } from '../../../lib/forms';
import { savedRepos } from '../../../lib/repos';
import { back } from '../../../lib/respond';
import { adminClient } from '../../../lib/supabase';

// Saves which of their own saved repositories a person features, in the order ticked.
export const POST: APIRoute = async ({ request, locals }) => {
  const person = locals.person;
  const db = adminClient();
  if (!person || !db) return back('/account', 'need_signin');
  const form = await request.formData();
  const parsed = parseFeatured(form.getAll('repo'), savedRepos(person.repos).map((r) => r.name));
  if (!parsed.ok) return back('/account#repos', parsed.error);
  const { error } = await db.from('people').update({ featured_repos: parsed.featured }).eq('id', person.id);
  return back('/account#repos', error ? 'save_failed' : 'repos_saved');
};
