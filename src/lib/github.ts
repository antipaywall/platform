import type { AccountFacts } from './eligibility';
import { queryWords } from './match';

export class GithubUnavailableError extends Error {}

/** A short piece of profile text, trimmed and cut to length, or null when there is none. */
export function text(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

const QUERY = `query {
  viewer {
    databaseId login avatarUrl createdAt name bio location
    repositories(privacy: PUBLIC, ownerAffiliations: OWNER) { totalCount }
    contributionsCollection { contributionCalendar { totalContributions } }
  }
}`;

/** Reads the facts the eligibility rules need, as the signed-in user. Throws GithubUnavailableError on any failure. */
export async function fetchGithubFacts(token: string, fetchImpl: typeof fetch = fetch): Promise<AccountFacts> {
  let res: Response;
  try {
    res = await fetchImpl('https://api.github.com/graphql', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'antipaywall' },
      body: JSON.stringify({ query: QUERY }),
    });
  } catch {
    throw new GithubUnavailableError('network');
  }
  if (!res.ok) throw new GithubUnavailableError(`status ${res.status}`);
  const body = (await res.json().catch(() => null)) as any;
  const v = body?.data?.viewer;
  if (!v?.databaseId) throw new GithubUnavailableError('no viewer');
  return {
    provider: 'github',
    accountId: v.databaseId,
    handle: v.login,
    avatarUrl: v.avatarUrl,
    accountCreatedAt: v.createdAt,
    contributions12mo: v.contributionsCollection?.contributionCalendar?.totalContributions ?? 0,
    name: text(v.name, 120),
    bio: text(v.bio, 400),
    location: text(v.location, 120),
    repoCount: Number.isSafeInteger(v.repositories?.totalCount) ? v.repositories.totalCount : null,
  };
}

export type RepoHit = { fullName: string; url: string; description: string; stars: number; license: string | null };

/**
 * The GitHub searches to run for an idea. A sentence sent whole finds almost nothing (GitHub wants
 * every word), so we search by its meaningful words in a few ways: all of them, the first few, a
 * named paid tool's "alternative", and as topics. At most four, to stay inside GitHub's limits.
 */
export function repoQueries(q: string): string[] {
  const words = queryWords(q).slice(0, 8);
  if (!words.length) return [];
  const out: string[] = [];
  const scope = 'in:name,description,topics fork:false archived:false';
  out.push(`${words.slice(0, 5).join(' ')} ${scope}`);
  if (words.length > 3) out.push(`${words.slice(0, 3).join(' ')} ${scope}`);
  // "A free Calendly", "replacement for Formspree": the named tool's alternatives.
  const named = q.match(/(?:alternative to|replacement for|replace|version of|instead of|like|free|open[- ]source)\s+([A-Z][\w.+-]{2,30}(?:\s[A-Z][\w.+-]{1,20})?)/);
  if (named) out.push(`${named[1]} alternative ${scope}`);
  if (words.length >= 2) out.push(`${words.slice(0, 2).map((w) => `topic:${w.replace(/[^a-z0-9-]/g, '')}`).join(' ')} fork:false archived:false`);
  else out.push(`topic:${words[0].replace(/[^a-z0-9-]/g, '')} fork:false archived:false`);
  return [...new Set(out)].slice(0, 4);
}

type Scored = RepoHit & { topics: string[] };

/**
 * One list from several searches: each project once, lists of links left out, ordered by how many
 * of the idea's words it mentions (in its name, description or topics), then by stars.
 */
export function rankRepoHits(lists: Scored[][], q: string, limit = 6): RepoHit[] {
  const words = queryWords(q);
  const stems = words.map((w) => w.slice(0, Math.max(4, w.length - 2)));
  const seen = new Map<string, Scored>();
  for (const h of lists.flat()) if (!seen.has(h.fullName.toLowerCase())) seen.set(h.fullName.toLowerCase(), h);
  return [...seen.values()]
    .filter((h) => !h.topics.some((t) => t === 'awesome' || t === 'awesome-list') && !/^awesome[-_]/i.test(h.fullName.split('/')[1] ?? ''))
    .map((h) => {
      const tokens = `${h.fullName.replace(/[/_.-]/g, ' ')} ${h.description} ${h.topics.join(' ').replace(/-/g, ' ')}`.toLowerCase().split(/[^\p{L}\p{N}+#]+/u);
      const found = stems.filter((s) => tokens.some((t) => t.startsWith(s))).length;
      return { h, found };
    })
    // With several words to go on, one shared word is a coincidence, not a match.
    .filter((x) => x.found >= (stems.length >= 3 ? 2 : 1) || stems.length === 0)
    .sort((a, b) => b.found - a.found || b.h.stars - a.h.stars)
    .slice(0, limit)
    .map(({ h }) => ({ fullName: h.fullName, url: h.url, description: h.description, stars: h.stars, license: h.license }));
}

/** Open-source projects that may already do what an idea describes: the closest first, then the most starred. */
export async function searchRepos(q: string, fetchImpl: typeof fetch = fetch): Promise<RepoHit[]> {
  const query = q.trim().slice(0, 120);
  if (query.length < 3) return [];
  const headers: Record<string, string> = { accept: 'application/vnd.github+json', 'user-agent': 'antipaywall' };
  const token = import.meta.env.GITHUB_TOKEN;
  if (token) headers.authorization = `Bearer ${token}`;
  const queries = repoQueries(query);
  if (!queries.length) return [];
  const run = async (gq: string): Promise<Scored[] | null> => {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(gq)}&sort=stars&order=desc&per_page=10`;
    const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(6000) }).catch(() => null);
    if (!res || !res.ok) return null;
    const body = (await res.json().catch(() => null)) as any;
    return ((body?.items ?? []) as any[]).map((r) => ({
      fullName: String(r.full_name),
      url: String(r.html_url),
      description: String(r.description ?? '').slice(0, 200),
      stars: Number(r.stargazers_count) || 0,
      license: r.license?.spdx_id && r.license.spdx_id !== 'NOASSERTION' ? String(r.license.spdx_id) : null,
      topics: Array.isArray(r.topics) ? r.topics.map(String) : [],
    }));
  };
  const lists = await Promise.all(queries.map(run));
  // If GitHub answered none of them, say so; if it answered some, use those.
  if (lists.every((l) => l === null)) throw new GithubUnavailableError('search');
  return rankRepoHits(lists.filter((l): l is Scored[] => l !== null), query);
}
