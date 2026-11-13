import type { APIRoute } from 'astro';
import { checkEntryRepo, CURRENT_SEASON, parseEntryRepo } from '../../../lib/entries';
import { back, safeNext } from '../../../lib/respond';
import { adminClient } from '../../../lib/supabase';

// Start (or change) your Season 1 entry: a public GitHub repo you own. Builders who joined only.
export const POST: APIRoute = async ({ request, locals }) => {
  const form = await request.formData();
  const page = safeNext(String(form.get('next') ?? ''), '/hackathon');
  const person = locals.person;
  if (!person) return back(page, 'need_signin');
  if (!person.is_builder) return back('/hackathon/join/build', 'entry_join_first');
  const db = adminClient();
  if (!db) return back(page, 'save_failed');
  if (form.get('action') === 'remove') {
    const { error } = await db.from('season_entries').delete().eq('season_id', CURRENT_SEASON).eq('person_id', person.id);
    return back(page, error ? 'save_failed' : 'entry_removed');
  }
  const login = person.provider === 'github' ? person.handle : (person as { github_login?: string | null }).github_login;
  if (!login) return back(page, 'entry_needs_github');
  const repo = parseEntryRepo(String(form.get('repo') ?? ''));
  if (!repo) return back(page, 'entry_bad_repo');
  const checked = await checkEntryRepo(repo.owner, repo.name, login);
  if (!checked.ok) return back(page, checked.reason === 'private' ? 'entry_private' : checked.reason === 'not_yours' ? 'entry_not_yours' : checked.reason === 'unavailable' ? 'github_unavailable' : 'entry_not_found');
  const { error } = await db.from('season_entries').upsert(
    { season_id: CURRENT_SEASON, person_id: person.id, repo_full_name: checked.fullName, repo_github_id: checked.githubId, updated_at: new Date().toISOString() },
    { onConflict: 'season_id,person_id' },
  );
  return back(page, error ? (error.code === '23505' ? 'entry_taken' : 'save_failed') : 'entry_started');
};
