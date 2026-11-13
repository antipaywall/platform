// Talking to GitHub for the sync: what to search for, reading repos 50 at a time, and stopping
// cleanly before the rate limit runs out so the next run picks up where this one stopped.

import type { RepoFacts } from './filter';

export type HelpIssue = { number: number; title: string; url: string; labels: string[]; comments: number; updatedAt: string };

export class RateLimited extends Error {}
/** GitHub's own servers failed or timed out (5xx). Worth a retry with a smaller request. */
export class GithubServerError extends Error {}

/** Tracks how many requests GitHub says are left, keeping a reserve. */
export class GithubBudget {
  private remaining = Infinity;
  constructor(private readonly reserve = 50) {}
  update(headers: Headers): void {
    const left = Number(headers.get('x-ratelimit-remaining'));
    if (headers.has('x-ratelimit-remaining') && Number.isFinite(left)) this.remaining = left;
  }
  get exhausted(): boolean {
    return this.remaining < this.reserve;
  }
  check(): void {
    if (this.exhausted) throw new RateLimited('GitHub rate limit reserve reached');
  }
}

const SUFFIX = ' archived:false fork:false';

/** The repository searches that find a paid product's open-source alternatives. */
export function searchQueries(p: { slug: string; topics: readonly string[]; search_terms: readonly string[] }): string[] {
  return [...new Set([
    ...p.topics.filter((t) => t !== `${p.slug}-alternative`).map((t) => `topic:${t}${SUFFIX}`),
    ...p.search_terms.map((t) => `"${t.replace(/"/g, '')}" in:name,description${SUFFIX}`),
    `topic:${p.slug}-alternative${SUFFIX}`,
  ])];
}

const REPO_FIELDS = `
  databaseId nameWithOwner url description homepageUrl
  repositoryTopics(first: 20) { nodes { topic { name } } }
  licenseInfo { spdxId name }
  stargazerCount forkCount isArchived isFork pushedAt createdAt
  issues(states: OPEN) { totalCount }
  helpWanted: issues(states: OPEN, labels: ["help wanted"]) { totalCount }
  goodFirst: issues(states: OPEN, labels: ["good first issue"]) { totalCount }
  latestRelease { tagName publishedAt }
  helpIssues: issues(states: OPEN, labels: ["help wanted", "good first issue"], first: 10, orderBy: { field: UPDATED_AT, direction: DESC }) {
    nodes { number title url comments { totalCount } updatedAt labels(first: 5) { nodes { name } } }
  }`;

const gqlString = (s: string) => JSON.stringify(s);

/** Reads up to 50 repos in one GraphQL request. Repos that no longer exist are left out. */
export async function fetchRepoBatch(
  names: string[],
  token: string,
  budget: GithubBudget,
  f: typeof fetch = fetch,
): Promise<{ repos: RepoFacts[]; issues: Map<string, HelpIssue[]> }> {
  if (names.length > 50) throw new Error('A batch holds at most 50 repos');
  budget.check();
  const parts = names.map((n, i) => {
    const [owner, name] = n.split('/');
    return `r${i}: repository(owner: ${gqlString(owner)}, name: ${gqlString(name)}) { ${REPO_FIELDS} }`;
  });
  const res = await f('https://api.github.com/graphql', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'antipaywall-sync' },
    body: JSON.stringify({ query: `query { ${parts.join('\n')} }` }),
  });
  budget.update(res.headers);
  if (res.status === 403 || res.status === 429) throw new RateLimited(`GitHub answered ${res.status}`);
  if (res.status >= 500) throw new GithubServerError(`GitHub GraphQL answered ${res.status}`);
  if (!res.ok) throw new Error(`GitHub GraphQL answered ${res.status}`);
  const body = (await res.json()) as { data?: Record<string, any> | null; errors?: { message?: string }[] };
  // An answer with errors and no data is a failure, not "none of these repos exist".
  if (!body.data && body.errors?.length) throw new Error(`GitHub GraphQL: ${body.errors.map((e) => e.message).join('; ')}`);
  const repos: RepoFacts[] = [];
  const issues = new Map<string, HelpIssue[]>();
  for (const r of Object.values(body.data ?? {})) {
    if (!r || typeof r.databaseId !== 'number') continue;
    repos.push({
      githubId: r.databaseId,
      fullName: String(r.nameWithOwner),
      url: String(r.url),
      description: r.description ? String(r.description).slice(0, 400) : null,
      homepage: typeof r.homepageUrl === 'string' && /^https?:\/\//.test(r.homepageUrl) ? r.homepageUrl : null,
      topics: (r.repositoryTopics?.nodes ?? []).map((n: any) => String(n.topic.name)),
      licenseSpdx: r.licenseInfo?.spdxId && r.licenseInfo.spdxId !== 'NOASSERTION' ? String(r.licenseInfo.spdxId) : null,
      licenseName: r.licenseInfo?.name ? String(r.licenseInfo.name) : null,
      stars: Number(r.stargazerCount) || 0,
      forks: Number(r.forkCount) || 0,
      openIssues: Number(r.issues?.totalCount) || 0,
      helpWanted: Number(r.helpWanted?.totalCount) || 0,
      goodFirst: Number(r.goodFirst?.totalCount) || 0,
      archived: Boolean(r.isArchived),
      fork: Boolean(r.isFork),
      pushedAt: String(r.pushedAt ?? r.createdAt),
      createdAt: String(r.createdAt),
      latestReleaseTag: r.latestRelease?.tagName ?? null,
      latestReleaseAt: r.latestRelease?.publishedAt ?? null,
    });
    issues.set(
      String(r.nameWithOwner),
      (r.helpIssues?.nodes ?? [])
        .filter((i: any) => typeof i?.url === 'string' && i.url.startsWith('https://github.com/'))
        .map((i: any) => ({
          number: Number(i.number), title: String(i.title).slice(0, 200), url: String(i.url),
          labels: (i.labels?.nodes ?? []).map((l: any) => String(l.name)), comments: Number(i.comments?.totalCount) || 0, updatedAt: String(i.updatedAt),
        })),
    );
  }
  return { repos, issues };
}

const YEAR_MS = 365 * 24 * 3600 * 1000;

/** Whether a repo's page is open to search engines: it must carry something GitHub doesn't show. */
export function isIndexable(p: { productLinks: number; gapLinks: number; hasStarPoints: boolean; stars: number; pushedAt: string }, now: Date): boolean {
  if (p.productLinks > 0 || p.gapLinks > 0 || p.hasStarPoints) return true;
  return p.stars >= 200 && now.getTime() - Date.parse(p.pushedAt) < YEAR_MS;
}

/** A repository search result as GitHub returns it (the fields the sync reads). */
export type SearchItem = {
  id: number; full_name: string; html_url: string; description?: string | null; homepage?: string | null; topics?: string[];
  license?: { spdx_id?: string | null; name?: string | null } | null; stargazers_count?: number; forks_count?: number;
  open_issues_count?: number; archived?: boolean; fork?: boolean; pushed_at?: string; created_at?: string;
};

/**
 * Repo facts from a search result, so the junk filter and the product check run before any
 * further request. Help-wanted counts and releases come later, only for repos that pass.
 */
export function factsFromSearchItem(i: SearchItem): RepoFacts | null {
  if (typeof i?.id !== 'number' || typeof i.full_name !== 'string' || typeof i.html_url !== 'string' || !i.html_url.startsWith('https://github.com/')) return null;
  const spdx = i.license?.spdx_id && i.license.spdx_id !== 'NOASSERTION' ? i.license.spdx_id : null;
  return {
    githubId: i.id, fullName: i.full_name, url: i.html_url,
    description: i.description ? String(i.description).slice(0, 400) : null,
    homepage: typeof i.homepage === 'string' && /^https?:\/\//.test(i.homepage) ? i.homepage : null,
    topics: Array.isArray(i.topics) ? i.topics.map(String) : [],
    licenseSpdx: spdx, licenseName: spdx ? (i.license?.name ?? null) : null,
    stars: Number(i.stargazers_count) || 0, forks: Number(i.forks_count) || 0, openIssues: Number(i.open_issues_count) || 0,
    helpWanted: 0, goodFirst: 0, archived: Boolean(i.archived), fork: Boolean(i.fork),
    pushedAt: String(i.pushed_at ?? i.created_at ?? ''), createdAt: String(i.created_at ?? ''),
    latestReleaseTag: null, latestReleaseAt: null,
  };
}

/**
 * Reads repos in batches, tolerating GitHub timing out on a heavy query: a failed batch is tried
 * once more, then split in half, down to single repos. A single repo that still fails is left out
 * of this run and named in `failed`. Running out of allowance still stops everything.
 */
export async function fetchReposResilient(
  names: string[],
  token: string,
  budget: GithubBudget,
  f: typeof fetch = fetch,
  pauseMs = 3000,
): Promise<{ repos: RepoFacts[]; issues: Map<string, HelpIssue[]>; failed: string[] }> {
  const out = { repos: [] as RepoFacts[], issues: new Map<string, HelpIssue[]>(), failed: [] as string[] };
  const run = async (part: string[]): Promise<void> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const got = await fetchRepoBatch(part, token, budget, f);
        out.repos.push(...got.repos);
        for (const [k, v] of got.issues) out.issues.set(k, v);
        return;
      } catch (e) {
        if (!(e instanceof GithubServerError)) throw e;
        if (pauseMs) await new Promise((r) => setTimeout(r, pauseMs));
      }
    }
    if (part.length === 1) {
      out.failed.push(part[0]);
      return;
    }
    const mid = Math.ceil(part.length / 2);
    await run(part.slice(0, mid));
    await run(part.slice(mid));
  };
  for (let i = 0; i < names.length; i += 25) await run(names.slice(i, i + 25));
  return out;
}
