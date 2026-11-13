// Public repositories, read from GitHub or GitLab and saved on the person's row, so a profile
// page never waits on either. Kept free of database code so it can be tested on its own.

import type { Provider } from './accounts';
import { text } from './github';

export type Repo = {
  name: string;
  url: string;
  description: string | null;
  /** GitLab's list does not say, so it is null for GitLab projects. */
  language: string | null;
  stars: number;
  pushedAt: string | null;
};

export class ReposUnavailableError extends Error {}

/** How many are kept on the row, and how many a profile shows. */
export const KEEP = 30;
export const FEATURED_MAX = 6;
/** A saved copy older than this is refreshed when the profile is next viewed. */
export const STALE_MS = 24 * 60 * 60 * 1000;

const HOSTS: Record<Provider, string> = { github: 'https://github.com/', gitlab: 'https://gitlab.com/' };

/** Most-starred first, then most recently updated. */
export const byStars = (a: Repo, b: Repo) => b.stars - a.stars || Date.parse(b.pushedAt ?? '') - Date.parse(a.pushedAt ?? '') || 0;

/**
 * The account's own public repositories: no forks, nothing archived, nothing private.
 * Throws ReposUnavailableError when the provider does not answer.
 */
export async function fetchRepos(
  who: { provider: Provider; handle: string; accountId: number },
  opts: { fetchImpl?: typeof fetch; githubToken?: string } = {},
): Promise<Repo[]> {
  const f = opts.fetchImpl ?? fetch;
  const github = who.provider === 'github';
  const url = github
    ? `https://api.github.com/users/${encodeURIComponent(who.handle)}/repos?type=owner&sort=pushed&per_page=100`
    : `https://gitlab.com/api/v4/users/${who.accountId}/projects?visibility=public&archived=false&order_by=last_activity_at&per_page=100`;
  const headers: Record<string, string> = { 'user-agent': 'antipaywall', accept: github ? 'application/vnd.github+json' : 'application/json' };
  if (github && opts.githubToken) headers.authorization = `Bearer ${opts.githubToken}`;
  const res = await f(url, { headers }).catch(() => null);
  if (!res || !res.ok) throw new ReposUnavailableError(res ? `status ${res.status}` : 'network');
  const list = (await res.json().catch(() => null)) as unknown;
  if (!Array.isArray(list)) throw new ReposUnavailableError('not a list');
  const repos: Repo[] = [];
  for (const r of list as any[]) {
    if (!r || typeof r !== 'object') continue;
    if (github ? r.fork || r.archived || r.private : r.forked_from_project || r.archived || r.visibility !== 'public') continue;
    const name = text(github ? r.name : r.path, 100);
    const link = github ? r.html_url : r.web_url;
    if (!name || typeof link !== 'string' || !link.startsWith(HOSTS[who.provider])) continue;
    const stars = Number(github ? r.stargazers_count : r.star_count);
    repos.push({
      name,
      url: link,
      description: text(r.description, 200),
      language: github ? text(r.language, 40) : null,
      stars: Number.isSafeInteger(stars) && stars > 0 ? stars : 0,
      pushedAt: typeof (github ? r.pushed_at : r.last_activity_at) === 'string' ? (github ? r.pushed_at : r.last_activity_at) : null,
    });
  }
  return repos.sort(byStars).slice(0, KEEP);
}

/** What a profile shows: the person's picks in their order, or their top repos by stars. */
export function pickFeatured(repos: Repo[], featured: readonly string[]): Repo[] {
  if (featured.length) {
    const byName = new Map(repos.map((r) => [r.name, r]));
    return featured.map((n) => byName.get(n)).filter((r): r is Repo => Boolean(r)).slice(0, FEATURED_MAX);
  }
  return [...repos].sort(byStars).slice(0, FEATURED_MAX);
}

/** Reads the saved copy off a row. Anything malformed is dropped rather than shown. */
export function savedRepos(raw: unknown): Repo[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((r): r is Repo =>
    r && typeof r === 'object' && typeof r.name === 'string' && typeof r.url === 'string' && /^https:\/\/(github|gitlab)\.com\//.test(r.url) && typeof r.stars === 'number');
}

export const isStale = (fetchedAt: string | null | undefined, now: Date) => !fetchedAt || now.getTime() - Date.parse(fetchedAt) > STALE_MS;

/** A colour for the language dot, from GitHub's own palette for the common ones. */
const LANG: Record<string, string> = {
  TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#3572A5', Go: '#00ADD8', Rust: '#dea584', Java: '#b07219',
  'C++': '#f34b7d', C: '#555555', 'C#': '#178600', Ruby: '#701516', PHP: '#4F5D95', Swift: '#F05138', Kotlin: '#A97BFF',
  Dart: '#00B4AB', Shell: '#89e051', HTML: '#e34c26', CSS: '#563d7c', Vue: '#41b883', Svelte: '#ff3e00', Astro: '#ff5a03',
  Elixir: '#6e4a7e', Zig: '#ec915c', Lua: '#000080', 'Jupyter Notebook': '#DA5B0B',
};
export const languageColor = (lang: string | null) => (lang && LANG[lang]) || 'oklch(0.66 0.025 310)';

export type Details = { name: string | null; bio: string | null; location: string | null; repoCount: number | null };

/** The public profile details: name, bio, location and public repo count. Null when the provider doesn't answer. */
export async function fetchDetails(
  who: { provider: Provider; handle: string; accountId: number },
  opts: { fetchImpl?: typeof fetch; githubToken?: string } = {},
): Promise<Details | null> {
  const f = opts.fetchImpl ?? fetch;
  const github = who.provider === 'github';
  const headers: Record<string, string> = { 'user-agent': 'antipaywall', accept: github ? 'application/vnd.github+json' : 'application/json' };
  if (github && opts.githubToken) headers.authorization = `Bearer ${opts.githubToken}`;
  const url = github ? `https://api.github.com/users/${encodeURIComponent(who.handle)}` : `https://gitlab.com/api/v4/users/${who.accountId}`;
  const res = await f(url, { headers }).catch(() => null);
  if (!res || !res.ok) return null;
  const u = (await res.json().catch(() => null)) as any;
  if (!u || typeof u !== 'object') return null;
  const count = Number(u.public_repos);
  return { name: text(u.name, 120), bio: text(u.bio, 400), location: text(u.location, 120), repoCount: github && Number.isSafeInteger(count) && count >= 0 ? count : null };
}
