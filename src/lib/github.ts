import type { GithubFacts } from './eligibility';

export class GithubUnavailableError extends Error {}

const QUERY = `query {
  viewer {
    databaseId login avatarUrl createdAt
    contributionsCollection { contributionCalendar { totalContributions } }
  }
}`;

/** Reads the facts the eligibility rules need, as the signed-in user. Throws GithubUnavailableError on any failure. */
export async function fetchGithubFacts(token: string, fetchImpl: typeof fetch = fetch): Promise<GithubFacts> {
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
    githubId: v.databaseId,
    handle: v.login,
    avatarUrl: v.avatarUrl,
    accountCreatedAt: v.createdAt,
    contributions12mo: v.contributionsCollection?.contributionCalendar?.totalContributions ?? 0,
  };
}

export type RepoHit = { fullName: string; url: string; description: string; stars: number; license: string | null };

/** Open-source projects that may already do what an idea describes, most-starred first. */
export async function searchRepos(q: string, fetchImpl: typeof fetch = fetch): Promise<RepoHit[]> {
  const query = q.trim().slice(0, 120);
  if (query.length < 3) return [];
  const headers: Record<string, string> = { accept: 'application/vnd.github+json', 'user-agent': 'antipaywall' };
  const token = import.meta.env.GITHUB_TOKEN;
  if (token) headers.authorization = `Bearer ${token}`;
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=6`;
  const res = await fetchImpl(url, { headers }).catch(() => null);
  if (!res || !res.ok) throw new GithubUnavailableError('search');
  const body = (await res.json()) as any;
  return (body.items ?? []).map((r: any) => ({
    fullName: String(r.full_name),
    url: String(r.html_url),
    description: String(r.description ?? '').slice(0, 200),
    stars: Number(r.stargazers_count) || 0,
    license: r.license?.spdx_id && r.license.spdx_id !== 'NOASSERTION' ? String(r.license.spdx_id) : null,
  }));
}
