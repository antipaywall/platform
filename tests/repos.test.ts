import { describe, expect, it } from 'vitest';
import { FEATURED_MAX, fetchRepos, isStale, pickFeatured, ReposUnavailableError, savedRepos, type Repo } from '../src/lib/repos';

const json = (b: unknown, status = 200) => (async () => new Response(JSON.stringify(b), { status })) as unknown as typeof fetch;
const repo = (name: string, stars: number, pushedAt = '2026-01-01T00:00:00Z'): Repo => ({ name, url: `https://github.com/a/${name}`, description: null, language: null, stars, pushedAt });

describe('fetchRepos', () => {
  const gh = [
    { name: 'big', html_url: 'https://github.com/a/big', description: ' A  big\nthing ', language: 'TypeScript', stargazers_count: 50, pushed_at: '2026-10-01T00:00:00Z' },
    { name: 'forked', html_url: 'https://github.com/a/forked', fork: true, stargazers_count: 999 },
    { name: 'old', html_url: 'https://github.com/a/old', archived: true, stargazers_count: 999 },
    { name: 'secret', html_url: 'https://github.com/a/secret', private: true, stargazers_count: 999 },
    { name: 'evil', html_url: 'javascript:alert(1)', stargazers_count: 999 },
    { name: 'small', html_url: 'https://github.com/a/small', description: null, language: null, stargazers_count: 2, pushed_at: '2026-11-01T00:00:00Z' },
  ];
  it('keeps only the account\'s own public repositories, most-starred first', async () => {
    const got = await fetchRepos({ provider: 'github', handle: 'a', accountId: 1 }, { fetchImpl: json(gh) });
    expect(got.map((r) => r.name)).toEqual(['big', 'small']);
    expect(got[0]).toEqual({ name: 'big', url: 'https://github.com/a/big', description: 'A big thing', language: 'TypeScript', stars: 50, pushedAt: '2026-10-01T00:00:00Z' });
  });
  it('sends the token to GitHub only when there is one', async () => {
    const seen: (string | null)[] = [];
    const f = (async (_u: string, init?: RequestInit) => { seen.push(new Headers(init?.headers).get('authorization')); return new Response('[]'); }) as unknown as typeof fetch;
    await fetchRepos({ provider: 'github', handle: 'a', accountId: 1 }, { fetchImpl: f, githubToken: 'tok' });
    await fetchRepos({ provider: 'github', handle: 'a', accountId: 1 }, { fetchImpl: f });
    await fetchRepos({ provider: 'gitlab', handle: 'a', accountId: 1 }, { fetchImpl: f, githubToken: 'tok' });
    expect(seen).toEqual(['Bearer tok', null, null]);
  });
  it('reads GitLab projects, leaving out forks', async () => {
    const gl = [
      { path: 'tool', web_url: 'https://gitlab.com/a/tool', description: 'A tool', star_count: 3, last_activity_at: '2026-09-01T00:00:00Z', visibility: 'public' },
      { path: 'copy', web_url: 'https://gitlab.com/a/copy', forked_from_project: { id: 1 }, star_count: 9, visibility: 'public' },
    ];
    const got = await fetchRepos({ provider: 'gitlab', handle: 'a', accountId: 7 }, { fetchImpl: json(gl) });
    expect(got).toEqual([{ name: 'tool', url: 'https://gitlab.com/a/tool', description: 'A tool', language: null, stars: 3, pushedAt: '2026-09-01T00:00:00Z' }]);
  });
  it('throws ReposUnavailableError when the provider does not answer', async () => {
    await expect(fetchRepos({ provider: 'github', handle: 'a', accountId: 1 }, { fetchImpl: json({}, 403) })).rejects.toBeInstanceOf(ReposUnavailableError);
    await expect(fetchRepos({ provider: 'github', handle: 'a', accountId: 1 }, { fetchImpl: json({ message: 'x' }) })).rejects.toBeInstanceOf(ReposUnavailableError);
    const offline = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    await expect(fetchRepos({ provider: 'gitlab', handle: 'a', accountId: 1 }, { fetchImpl: offline })).rejects.toBeInstanceOf(ReposUnavailableError);
  });
});

describe('pickFeatured', () => {
  const repos = Array.from({ length: 9 }, (_, i) => repo(`r${i}`, i));
  it('shows the top six by stars when nothing is picked', () => {
    expect(pickFeatured(repos, []).map((r) => r.name)).toEqual(['r8', 'r7', 'r6', 'r5', 'r4', 'r3']);
  });
  it('shows the picks in the order chosen, skipping any that are gone', () => {
    expect(pickFeatured(repos, ['r1', 'gone', 'r5']).map((r) => r.name)).toEqual(['r1', 'r5']);
  });
  it('never shows more than six', () => {
    expect(pickFeatured(repos, repos.map((r) => r.name)).length).toBe(FEATURED_MAX);
  });
});

describe('savedRepos and isStale', () => {
  it('drops anything malformed from the saved copy', () => {
    expect(savedRepos([repo('ok', 1), { name: 'x', url: 'https://evil.example/x', stars: 1 }, null, 'x'])).toEqual([repo('ok', 1)]);
    expect(savedRepos({})).toEqual([]);
  });
  it('treats a copy older than a day, or none, as stale', () => {
    const now = new Date('2026-11-12T12:00:00Z');
    expect(isStale(null, now)).toBe(true);
    expect(isStale('2026-11-11T11:00:00Z', now)).toBe(true);
    expect(isStale('2026-11-12T01:00:00Z', now)).toBe(false);
  });
});

import { isPublic, parseProfilePath, profilePath } from '../src/lib/profiles';

describe('profile addresses', () => {
  it('puts GitHub accounts at /builders/<name> and GitLab ones under /builders/gitlab/', () => {
    expect(profilePath({ username: 'prophen', handle: 'prophen' })).toBe('/builders/prophen');
    // One namespace: a GitLab builder's address is their username, not their GitLab handle.
    expect(profilePath({ username: 'tanuki', handle: 'tanuki.dev' })).toBe('/builders/tanuki');
    expect(profilePath({ username: null, handle: 'old-handle' })).toBe('/builders/old-handle');
  });
  it('reads them back, and nothing else', () => {
    expect(parseProfilePath('prophen')).toEqual({ kind: 'username', name: 'prophen' });
    // The old GitLab addresses are still understood, so they can redirect.
    expect(parseProfilePath('gitlab/tanuki.dev')).toEqual({ kind: 'gitlab', handle: 'tanuki.dev' });
    for (const bad of ['', 'a/b', 'gitlab/a/b', '..', '%E0%A4%A', 'a%2Fb', '-x', 'x y']) expect(parseProfilePath(bad)).toBeNull();
  });
  it('shows builders always and anyone else only when they chose to', () => {
    expect(isPublic({ is_builder: true, profile_public: false })).toBe(true);
    expect(isPublic({ is_builder: false, profile_public: true })).toBe(true);
    expect(isPublic({ is_builder: false, profile_public: false })).toBe(false);
    expect(isPublic({ is_builder: false })).toBe(false);
  });
});

import { fetchDetails } from '../src/lib/repos';

describe('fetchDetails', () => {
  it('reads name, bio, location and repo count from GitHub', async () => {
    const f = (async () => new Response(JSON.stringify({ name: ' Nikema ', bio: 'Builds  agents', location: '', public_repos: 208 }))) as unknown as typeof fetch;
    expect(await fetchDetails({ provider: 'github', handle: 'prophen', accountId: 1 }, { fetchImpl: f })).toEqual({ name: 'Nikema', bio: 'Builds agents', location: null, repoCount: 208 });
  });
  it('gives nothing, rather than blanks, when the provider does not answer', async () => {
    const f = (async () => new Response('limit', { status: 403 })) as unknown as typeof fetch;
    expect(await fetchDetails({ provider: 'github', handle: 'a', accountId: 1 }, { fetchImpl: f })).toBeNull();
  });
});
