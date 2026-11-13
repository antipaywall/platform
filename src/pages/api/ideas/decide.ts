import type { APIRoute } from 'astro';
import { isAdmin } from '../../../lib/db';
import { appConfigured, closeSuggestion, mergeSuggestion, readIdeaFile } from '../../../lib/githubApp';
import { ideaPath, parseIdeaFile } from '../../../lib/ideaFile';
import { applyIdeaFile } from '../../../lib/ideasSync';
import { back } from '../../../lib/respond';
import { canDecide } from '../../../lib/suggestions';
import { adminClient } from '../../../lib/supabase';

// Accept (merge) or decline (close) a suggested improvement. Only the idea's starter, or a
// maintainer for ideas Antipaywall posted.
export const POST: APIRoute = async ({ request, locals }) => {
  const form = await request.formData();
  const slug = String(form.get('idea') ?? '');
  const number = Number(form.get('pr'));
  const action = String(form.get('action') ?? '');
  if (!/^[a-z0-9-]{1,90}$/.test(slug) || !Number.isInteger(number) || !['accept', 'decline'].includes(action)) return back('/ideas', 'idea_gone');
  const page = `/ideas/${slug}#suggestions`;
  const person = locals.person;
  if (!person) return back(page, 'need_signin');
  if (!appConfigured()) return back(page, 'app_not_connected');
  const db = adminClient();
  if (!db) return back(page, 'save_failed');
  const { data: idea } = await db.from('ideas').select('id, started_by_login').eq('slug', slug).maybeSingle();
  if (!idea) return back('/ideas', 'idea_gone');
  const login = person.username ?? person.handle;
  if (!canDecide({ startedBy: idea.started_by_login }, login, isAdmin(person) ? [login] : [])) return back(page, 'not_yours_to_decide');
  try {
    if (action === 'accept') {
      await mergeSuggestion(number);
      const file = await readIdeaFile(ideaPath(slug));
      if (file) await applyIdeaFile(db, parseIdeaFile(file.text, ideaPath(slug)), file.sha);
    } else {
      await closeSuggestion(number, `@${login} decided not to take this one. Thank you for suggesting it.`);
    }
  } catch {
    return back(page, action === 'accept' ? 'merge_failed' : 'save_failed');
  }
  await db.from('idea_suggestions').update({ state: action === 'accept' ? 'merged' : 'closed', updated_at: new Date().toISOString() }).eq('idea_id', idea.id).eq('pr_number', number);
  return back(page, action === 'accept' ? 'suggestion_accepted' : 'suggestion_declined');
};
