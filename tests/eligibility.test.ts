import { describe, expect, it } from 'vitest';
import { checkEligibility, type GithubFacts } from '../src/lib/eligibility';
import { fetchGithubFacts, GithubUnavailableError } from '../src/lib/github';

const now = new Date('2026-11-12T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();
const facts = (over: Partial<GithubFacts> = {}): GithubFacts => ({
  githubId: 1, handle: 'x', avatarUrl: '', accountCreatedAt: daysAgo(400), contributions12mo: 50, ...over,
});
const rule = (f: GithubFacts, id: string) => checkEligibility(f, now).results.find((r) => r.rule === id)!;

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
  });
  it('has exactly two rules', () => {
    expect(checkEligibility(facts(), now).results.map((r) => r.rule)).toEqual(['account_age', 'contributions']);
  });
});
