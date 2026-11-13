import type { APIRoute } from 'astro';
import { isAdmin } from '../../../lib/db';
import { appConfigured, closeSuggestion, getSuggestion, mergeSuggestion, readIdeaFile } from '../../../lib/githubApp';
import { ideaPath, parseIdeaFile } from '../../../lib/ideaFile';
import { applyIdeaFile } from '../../../lib/ideasSync';
import { back } from '../../../lib/respond';
import { canDecide, validSuggestionPr } from '../../../lib/suggestions';
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
  const { data: idea } = await db.from('ideas').select('id, author_id, started_by_login').eq('slug', slug).maybeSingle();
  if (!idea) return back('/ideas', 'idea_gone');
  const login = person.username;
  if (!login) return back('/auth/username', 'need_username');
  if (!canDecide({ authorId: idea.author_id, startedBy: idea.started_by_login }, { personId: person.id, login }, isAdmin(person) ? [login] : [])) return back(page, 'not_yours_to_decide');
  // Only an open suggestion for this idea, opened by the App on its own branch and changing this one
  // idea's file, can be accepted or declined here.
  const { data: listed } = await db.from('idea_suggestions').select('pr_number').eq('idea_id', idea.id).eq('pr_number', number).eq('state', 'open').maybeSingle();
  if (!listed) return back(page, 'not_a_suggestion');
  const checked = await getSuggestion(number).catch(() => null);
  if (!checked || checked.pr.state !== 'open' || !validSuggestionPr(checked.pr, checked.files, slug)) return back(page, 'not_a_suggestion');
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
