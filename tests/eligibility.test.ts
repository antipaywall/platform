import { describe, expect, it } from 'vitest';
import { profileUrl, providerOf } from '../src/lib/accounts';
import { checkEligibility, type AccountFacts } from '../src/lib/eligibility';
import { fetchGithubFacts, GithubUnavailableError } from '../src/lib/github';
import { fetchGitlabFacts, GitlabUnavailableError } from '../src/lib/gitlab';

const now = new Date('2026-11-12T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();
const facts = (over: Partial<AccountFacts> = {}): AccountFacts => ({
  provider: 'github', accountId: 1, handle: 'x', avatarUrl: '', accountCreatedAt: daysAgo(400), contributions12mo: 50, ...over,
});
const rule = (f: AccountFacts, id: string) => checkEligibility(f, now).results.find((r) => r.rule === id)!;

describe('checkEligibility', () => {
  it('needs an account at least 30 days old', () => {
    expect(rule(facts({ accountCreatedAt: daysAgo(29) }), 'account_age').pass).toBe(false);
    expect(rule(facts({ accountCreatedAt: daysAgo(30) }), 'account_age').pass).toBe(true);
  });
  it('needs ten contributions in the last year', () => {
    expect(rule(facts({ contributions12mo: 9 }), 'contributions').pass).toBe(false);
    expect(rule(facts({ contributions12mo: 10 }), 'contributions').pass).toBe(true);
  });
  it('verifies only when every rule passes, and explains each one with numbers', () => {
    expect(checkEligibility(facts(), now).verified).toBe(true);
    const bad = checkEligibility(facts({ contributions12mo: 2 }), now);
    expect(bad.verified).toBe(false);
    expect(rule(facts({ contributions12mo: 2 }), 'contributions').detail).toMatch(/shows 2 contributions.*at least 10/);
  });
});

describe('fetchGithubFacts', () => {
  it('throws GithubUnavailableError when GitHub answers 502', async () => {
    const f = (async () => new Response('bad', { status: 502 })) as unknown as typeof fetch;
    await expect(fetchGithubFacts('t', f)).rejects.toBeInstanceOf(GithubUnavailableError);
  });
  it('throws GithubUnavailableError when the network fails', async () => {
    const f = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    await expect(fetchGithubFacts('t', f)).rejects.toBeInstanceOf(GithubUnavailableError);
  });
  it('reads the account age and contribution count', async () => {
    const body = { data: { viewer: { databaseId: 7, login: 'a', avatarUrl: 'u', createdAt: '2020-01-01T00:00:00Z',
      contributionsCollection: { contributionCalendar: { totalContributions: 12 } } } } };
    const f = (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
    const got = await fetchGithubFacts('t', f);
    expect(got.accountCreatedAt).toBe('2020-01-01T00:00:00Z');
    expect(got.contributions12mo).toBe(12);
    expect(got).toMatchObject({ provider: 'github', accountId: 7, handle: 'a', name: null, bio: null, repoCount: null });
  });
  it('has exactly two rules', () => {
    expect(checkEligibility(facts(), now).results.map((r) => r.rule)).toEqual(['account_age', 'contributions']);
  });
});

describe('checkEligibility for GitLab', () => {
  it('names GitLab and says the profile must be public when contributions fall short', () => {
    const r = rule(facts({ provider: 'gitlab', contributions12mo: 0 }), 'contributions');
    expect(r.pass).toBe(false);
    expect(r.detail).toMatch(/Your GitLab profile shows 0 contributions.*while your profile is public/);
    expect(rule(facts({ provider: 'gitlab', accountCreatedAt: daysAgo(3) }), 'account_age').detail).toMatch(/^Your GitLab account is 3 days old/);
  });
  it('applies the same two thresholds', () => {
    expect(checkEligibility(facts({ provider: 'gitlab', contributions12mo: 10, accountCreatedAt: daysAgo(30) }), now).verified).toBe(true);
    expect(checkEligibility(facts({ provider: 'gitlab', contributions12mo: 9 }), now).verified).toBe(false);
  });
});

describe('fetchGitlabFacts', () => {
  const user = { id: 42, username: 'tanuki.dev', avatar_url: 'https://gitlab.com/a.png', created_at: '2021-03-04T05:06:07Z', name: 'Tanu Ki', bio: '  builds\n  things ', location: '' };
  const calendar = { [daysAgo(1).slice(0, 10)]: 4, [daysAgo(200).slice(0, 10)]: 3, [daysAgo(400).slice(0, 10)]: 50, 'nonsense': 9, [daysAgo(2).slice(0, 10)]: -5 };
  const respond = (routes: Record<string, () => Response>) => {
    const seen: { url: string; auth: string | null }[] = [];
    const f = (async (url: string, init?: RequestInit) => {
      seen.push({ url, auth: new Headers(init?.headers).get('authorization') });
      const hit = Object.entries(routes).find(([k]) => url.startsWith(k));
      return hit ? hit[1]() : new Response('no', { status: 404 });
    }) as unknown as typeof fetch;
    return { f, seen };
  };
  const json = (b: unknown) => () => new Response(JSON.stringify(b), { status: 200 });

  it('reads the account from the token and counts the last 365 days of the public calendar', async () => {
    const { f, seen } = respond({ 'https://gitlab.com/api/v4/user': json(user), 'https://gitlab.com/users/tanuki.dev/calendar.json': json(calendar) });
    expect(await fetchGitlabFacts('tok', now, f)).toEqual({
      provider: 'gitlab', accountId: 42, handle: 'tanuki.dev', avatarUrl: 'https://gitlab.com/a.png',
      accountCreatedAt: '2021-03-04T05:06:07Z', contributions12mo: 7,
      name: 'Tanu Ki', bio: 'builds things', location: null, repoCount: null,
    });
    expect(seen[0]).toEqual({ url: 'https://gitlab.com/api/v4/user', auth: 'Bearer tok' });
    // The token is only ever sent to the account endpoint, never to the public calendar.
    expect(seen[1].auth).toBeNull();
  });
  it('counts no contributions when the profile is private or the calendar cannot be read', async () => {
    for (const cal of [() => new Response('', { status: 404 }), () => new Response('<html>', { status: 200 }), json([1, 2])]) {
      const { f } = respond({ 'https://gitlab.com/api/v4/user': json(user), 'https://gitlab.com/users/': cal });
      expect((await fetchGitlabFacts('tok', now, f)).contributions12mo).toBe(0);
    }
  });
  it('throws GitlabUnavailableError when GitLab cannot say who this is', async () => {
    const offline = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    await expect(fetchGitlabFacts('t', now, offline)).rejects.toBeInstanceOf(GitlabUnavailableError);
    for (const r of [() => new Response('bad', { status: 401 }), json({ id: 0, username: 'x', created_at: '2020-01-01' }), json({ id: 5, created_at: '2020-01-01' }), json({ id: 5, username: 'x' }), () => new Response('{', { status: 200 })]) {
      const { f } = respond({ 'https://gitlab.com/api/v4/user': r });
      await expect(fetchGitlabFacts('t', now, f)).rejects.toBeInstanceOf(GitlabUnavailableError);
    }
  });
});

describe('accounts', () => {
  it('links each username to its own provider', () => {
    expect(profileUrl('github', 'octocat')).toBe('https://github.com/octocat');
    expect(profileUrl('gitlab', 'tanuki.dev')).toBe('https://gitlab.com/tanuki.dev');
  });
  it('treats rows from before GitLab existed as GitHub accounts', () => {
    expect(providerOf({})).toBe('github');
    expect(providerOf(null)).toBe('github');
    expect(providerOf({ provider: 'gitlab' })).toBe('gitlab');
    expect(providerOf({ provider: 'anything' })).toBe('github');
  });
});
