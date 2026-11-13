// Season entries. Someone who joined the hackathon is "Interested in Season 1" until they start
// their entry repo, which can happen any time up to the final cutoff; then they're a Season 1 builder.

import type { SupabaseClient } from '@supabase/supabase-js';

export const CURRENT_SEASON = 1;

/** owner/name, or a github.com address, to the repo it names. */
export function parseEntryRepo(input: string): { owner: string; name: string } | null {
  const m = /^(?:https:\/\/github\.com\/)?([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/.exec(input.trim());
  if (!m || m[2] === '.' || m[2] === '..') return null;
  return { owner: m[1], name: m[2] };
}

/** The repo must exist, be public, and be owned by the builder's GitHub account. */
export async function checkEntryRepo(
  owner: string,
  name: string,
  login: string,
  f: typeof fetch = fetch,
): Promise<{ ok: true; githubId: number; fullName: string } | { ok: false; reason: 'not_found' | 'private' | 'not_yours' | 'unavailable' }> {
  let res: Response;
  try {
    res = await f(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'antipaywall' } });
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (res.status === 404) return { ok: false, reason: 'not_found' };
  if (!res.ok) return { ok: false, reason: 'unavailable' };
  const r = (await res.json().catch(() => null)) as { id?: number; private?: boolean; full_name?: string; owner?: { login?: string } } | null;
  if (!r || typeof r.id !== 'number') return { ok: false, reason: 'not_found' };
  if (r.private) return { ok: false, reason: 'private' };
  if ((r.owner?.login ?? '').toLowerCase() !== login.toLowerCase()) return { ok: false, reason: 'not_yours' };
  return { ok: true, githubId: r.id, fullName: r.full_name ?? `${owner}/${name}` };
}

/** Which of these people have started a Season entry. */
export async function entriesFor(db: SupabaseClient, ids: string[], season = CURRENT_SEASON): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const { data } = await db.from('season_entries').select('person_id, repo_full_name').eq('season_id', season).in('person_id', ids);
  return new Map(((data ?? []) as { person_id: string; repo_full_name: string }[]).map((e) => [e.person_id, e.repo_full_name]));
}
