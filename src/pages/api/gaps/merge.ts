import type { APIRoute } from 'astro';
import { isAdmin } from '../../../lib/db';
import { back } from '../../../lib/respond';
import { adminClient } from '../../../lib/supabase';

// The organizer can fold a duplicate gap into another by hand. Most merges come from the poster
// picking an existing gap, or from a merged pull request to catalog/merges.yml.
export const POST: APIRoute = async ({ request, locals }) => {
  const form = await request.formData();
  const from = String(form.get('from') ?? '');
  const into = String(form.get('into') ?? '').trim().replace(/^.*\/ideas\//, '').replace(/[#?].*$/, '');
  const reason = String(form.get('reason') ?? '').trim().slice(0, 300);
  const page = /^[a-z0-9-]{1,90}$/.test(from) ? `/ideas/${from}` : '/ideas';
  if (!isAdmin(locals.person)) return back(page, 'need_signin');
  const db = adminClient();
  if (!db) return back(page, 'save_failed');
  const { data: pair } = await db.from('ideas').select('id, slug').in('slug', [from, into]);
  const a = pair?.find((p) => p.slug === from)?.id;
  const b = pair?.find((p) => p.slug === into)?.id;
  if (!a || !b) return back(page, 'idea_gone');
  const { data, error } = await db.rpc('merge_gap', { p_from: a, p_into: b, p_source: 'admin', p_reason: reason, p_by: locals.userId });
  if (error || data !== true) return back(page, 'save_failed');
  return back(`/ideas/${into}#merged`, 'merged');
};
