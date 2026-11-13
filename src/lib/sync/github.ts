// Talking to GitHub for the sync: what to search for, reading repos 50 at a time, and stopping
// cleanly before the rate limit runs out so the next run picks up where this one stopped.

import type { RepoFacts } from './filter';

export type HelpIssue = { number: number; title: string; url: string; labels: string[]; comments: number; updatedAt: string };

export class RateLimited extends Error {}

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
  if (!res.ok) throw new Error(`GitHub GraphQL answered ${res.status}`);
  const body = (await res.json()) as { data?: Record<string, any> };
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
