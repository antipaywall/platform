import type { APIRoute } from 'astro';
import { isAdmin } from '../../../lib/db';
import { canUnmerge } from '../../../lib/gaps';
import { back } from '../../../lib/respond';
import { takeSlot } from '../../../lib/ratelimit';
import { adminClient } from '../../../lib/supabase';

/** How many merges one signed-in account may undo in an hour. */
const MAX_UNMERGES_PER_HOUR = 10;

// "These aren't the same": anyone signed in can split a merged gap back out. The pair is then
// never merged again, and who did it is kept in the merge log.
export const POST: APIRoute = async ({ request, locals }) => {
  const form = await request.formData();
  const from = String(form.get('from') ?? '');
  const into = String(form.get('into') ?? '');
  const page = /^[a-z0-9-]{1,90}$/.test(into) ? `/ideas/${into}#merged` : '/ideas';
  if (!locals.userId || !canUnmerge({ person: Boolean(locals.person), admin: isAdmin(locals.person) })) return back(page, 'need_signin');
  const db = adminClient();
  if (!db) return back(page, 'save_failed');
  if ((await takeSlot(db, 'unmerge', locals.userId, MAX_UNMERGES_PER_HOUR)) === 'limited') return back(page, 'too_many');
  const { data: gap } = await db.from('ideas').select('id').eq('slug', from).maybeSingle();
  if (!gap) return back(page, 'idea_gone');
  const { data, error } = await db.rpc('unmerge_gap', { p_from: gap.id, p_by: locals.userId });
  if (error || data !== true) return back(page, 'save_failed');
  return back(`/ideas/${from}`, 'unmerged');
};
