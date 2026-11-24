import type { APIRoute } from 'astro';
import { appConfigured, authorFor, openSuggestion, readIdeaFile } from '../../../lib/githubApp';
import { ideaPath, parseIdeaFile } from '../../../lib/ideaFile';
import { takeSlot } from '../../../lib/ratelimit';
import { back } from '../../../lib/respond';
import { suggestionBranch } from '../../../lib/suggestions';
import { adminClient } from '../../../lib/supabase';

/** Suggestions one builder may send in an hour. */
const MAX_SUGGESTIONS_PER_HOUR = 10;

// Opens a suggested improvement as a pull request on the ideas repo, in the builder's name.
export const POST: APIRoute = async ({ request, locals }) => {
  const form = await request.formData();
  const slug = String(form.get('idea') ?? '');
  if (!/^[a-z0-9-]{1,90}$/.test(slug)) return back('/ideas', 'idea_gone');
  const page = `/ideas/${slug}/suggest`;
  const person = locals.person;
  if (!person) return back(page, 'need_signin');
  if (!appConfigured()) return back(page, 'app_not_connected');
  const db = adminClient();
  if (!db) return back(page, 'save_failed');
  if ((await takeSlot(db, 'suggest', person.id, MAX_SUGGESTIONS_PER_HOUR)) === 'limited') return back(page, 'too_many');
  const summary = String(form.get('summary') ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const text = String(form.get('text') ?? '').slice(0, 20000);
  if (summary.length < 5) return back(page, 'need_summary');
  const path = ideaPath(slug);
  const current = await readIdeaFile(path);
  if (!current) return back(page, 'save_failed');
  // The new text must still be a valid idea, about the same idea, started by the same person.
  let before;
  let after;
  try {
    before = parseIdeaFile(current.text, path);
    after = parseIdeaFile(text, path);
  } catch {
    return back(page, 'bad_idea_file');
  }
  if (after.startedBy !== before.startedBy) return back(page, 'bad_idea_file');
  if (text.trim() === current.text.trim()) return back(page, 'no_change');
  const login = person.username;
  if (!login) return back('/auth/username', 'need_username');
  const pr = await openSuggestion(path, text, {
    branch: suggestionBranch(slug, login, new Date()),
    title: summary,
    author: authorFor(login, person.github_id),
    by: login,
    sha: current.sha,
  }).catch(() => null);
  if (!pr) return back(page, 'save_failed');
  const { data: idea } = await db.from('ideas').select('id').eq('slug', slug).maybeSingle();
  if (idea) {
    await db.from('idea_suggestions').upsert({ idea_id: idea.id, pr_number: pr.number, author_login: login, person_id: person.id, title: summary, state: 'open' }, { onConflict: 'idea_id,pr_number' });
  }
  return back(`/ideas/${slug}#suggestions`, 'suggestion_sent');
};
