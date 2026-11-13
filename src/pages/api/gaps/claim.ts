import type { APIRoute } from 'astro';
import { parseClaim } from '../../../lib/gaps';
import { back } from '../../../lib/respond';
import { adminClient } from '../../../lib/supabase';

// Say you're building a gap, or stop. Claims never lock anyone out: they help builders find
// each other. Builders only, so a GitHub or GitLab sign-in.
export const POST: APIRoute = async ({ request, locals }) => {
  const form = await request.formData();
  const slug = String(form.get('idea') ?? '');
  const page = /^[a-z0-9-]{1,90}$/.test(slug) ? `/ideas/${slug}#builders` : '/ideas';
  const person = locals.person;
  if (!person) return back(page, 'need_builder_signin');
  const db = adminClient();
  if (!db) return back(page, 'save_failed');
  const { data: idea } = await db.from('ideas').select('id').eq('slug', slug).eq('status', 'listed').is('merged_into', null).maybeSingle();
  if (!idea) return back('/ideas', 'idea_gone');

  if (form.get('action') === 'unclaim') {
    const { error } = await db.from('gap_claims').delete().eq('idea_id', idea.id).eq('person_id', person.id);
    return back(page, error ? 'save_failed' : 'unclaimed');
  }
  const parsed = parseClaim(form);
  if (!parsed.ok) return back(page, parsed.code);
  const { error } = await db.from('gap_claims').upsert({ idea_id: idea.id, person_id: person.id, note: parsed.note, repo_url: parsed.repoUrl });
  if (error) return back(page, 'save_failed');
  // A gap with a builder on it is being built.
  await db.from('ideas').update({ build_status: 'building' }).eq('id', idea.id).eq('build_status', 'wanted');
  return back(page, 'claimed');
};
