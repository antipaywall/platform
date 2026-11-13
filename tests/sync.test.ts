import { describe, expect, it } from 'vitest';
import { passesFilter, THRESHOLDS, type RepoFacts } from '../src/lib/sync/filter';
import { samplePages, starPointsFromSamples } from '../src/lib/sync/stars';
import { plainLicense } from '../src/lib/sync/license';
import { GithubBudget, RateLimited, fetchRepoBatch, isIndexable, searchQueries } from '../src/lib/sync/github';

const now = new Date('2026-11-12T12:00:00Z');
const repo = (over: Partial<RepoFacts> = {}): RepoFacts => ({
  githubId: 1, fullName: 'calcom/cal.com', url: 'https://github.com/calcom/cal.com', description: 'Scheduling infrastructure for everyone',
  homepage: null, topics: ['scheduling'], licenseSpdx: 'AGPL-3.0', licenseName: 'GNU Affero General Public License v3.0',
  stars: 38000, forks: 9000, openIssues: 400, helpWanted: 41, goodFirst: 12, archived: false, fork: false,
  pushedAt: '2026-11-11T00:00:00Z', createdAt: '2021-04-01T00:00:00Z', latestReleaseTag: 'v5.0', latestReleaseAt: '2026-11-01T00:00:00Z',
  ...over,
});
const blocklist = { repos: ['evil/repo'], words: ['crack', 'free download'] };

describe('passesFilter', () => {
  it('lists a healthy repo', () => {
    expect(passesFilter(repo(), blocklist, now)).toEqual({ ok: true });
  });
  it('turns away a repo with no license', () => {
    expect(passesFilter(repo({ licenseSpdx: null, licenseName: null }), blocklist, now)).toEqual({ ok: false, reason: 'no_license' });
  });
  it('turns away an archived repo', () => {
    expect(passesFilter(repo({ archived: true }), blocklist, now)).toEqual({ ok: false, reason: 'archived' });
  });
  it('turns away a fork', () => {
    expect(passesFilter(repo({ fork: true }), blocklist, now)).toEqual({ ok: false, reason: 'fork' });
  });
  it(`turns away a repo with no push in ${THRESHOLDS.maxMonthsSincePush} months`, () => {
    expect(passesFilter(repo({ pushedAt: '2025-04-01T00:00:00Z' }), blocklist, now)).toEqual({ ok: false, reason: 'stale' });
  });
  it(`turns away a repo under ${THRESHOLDS.minStars} stars`, () => {
    expect(passesFilter(repo({ stars: 49 }), blocklist, now)).toEqual({ ok: false, reason: 'few_stars' });
  });
  it('lets a small repo tagged antipaywall through', () => {
    expect(passesFilter(repo({ stars: 49, topics: ['antipaywall'] }), blocklist, now)).toEqual({ ok: true });
  });
  it('turns away piracy words even with the antipaywall tag', () => {
    expect(passesFilter(repo({ description: 'GTA free download crack', topics: ['antipaywall'] }), blocklist, now)).toEqual({ ok: false, reason: 'blocked' });
  });
  it('turns away a blocklisted repo by name, in any case', () => {
    expect(passesFilter(repo({ fullName: 'Evil/Repo' }), blocklist, now)).toEqual({ ok: false, reason: 'blocked' });
  });
});

describe('star history', () => {
  it('reads every page of a small repo', () => {
    expect(samplePages(250)).toEqual([1, 2, 3]);
  });
  it('spreads 15 samples across the 400 pages GitHub allows', () => {
    const pages = samplePages(1_000_000);
    expect(pages).toHaveLength(15);
    expect(pages[0]).toBe(1);
    expect(pages.at(-1)).toBe(400);
    for (let i = 1; i < pages.length; i++) expect(pages[i]).toBeGreaterThan(pages[i - 1]);
  });
  it('asks for nothing when there are no stars', () => {
    expect(samplePages(0)).toEqual([]);
  });
  it('turns samples into points that end at today with the real total', () => {
    const points = starPointsFromSamples([{ page: 1, firstStarredAt: '2024-01-01T00:00:00Z' }, { page: 3, firstStarredAt: '2025-01-01T00:00:00Z' }], 260, now);
    expect(points[0]).toEqual(['2024-01-01', 1]);
    expect(points[1]).toEqual(['2025-01-01', 201]);
    expect(points.at(-1)).toEqual(['2026-11-12', 260]);
  });
});

describe('plainLicense', () => {
  it('explains MIT in plain words', () => {
    const l = plainLicense('MIT');
    expect(l.label).toBe('MIT');
    expect(l.words).toMatch(/even in paid products/);
  });
  it('explains the AGPL sharing rule', () => {
    expect(plainLicense('AGPL-3.0').words).toMatch(/share your changes/);
  });
  it('falls back for a license it does not know', () => {
    expect(plainLicense('WTFPL-ish').words).toBe("See the project's license file.");
    expect(plainLicense(null).label).toBe('No license');
  });
});

describe('isIndexable', () => {
  const base = { productLinks: 0, gapLinks: 0, hasStarPoints: false, stars: 150, pushedAt: '2026-10-01T00:00:00Z' };
  it('opens a repo linked to a paid product to search engines', () => {
    expect(isIndexable({ ...base, productLinks: 1 }, now)).toBe(true);
  });
  it('keeps a small unlinked repo hidden', () => {
    expect(isIndexable(base, now)).toBe(false);
  });
  it('opens a repo with star history', () => {
    expect(isIndexable({ ...base, hasStarPoints: true }, now)).toBe(true);
  });
  it('opens a popular, active repo', () => {
    expect(isIndexable({ ...base, stars: 200 }, now)).toBe(true);
  });
});

describe('searchQueries', () => {
  it('searches each topic, each search term and the -alternative topic, skipping archived repos and forks', () => {
    const qs = searchQueries({ slug: 'calendly', topics: ['scheduling'], search_terms: ['appointment booking'] });
    expect(qs).toEqual([
      'topic:scheduling archived:false fork:false',
      '"appointment booking" in:name,description archived:false fork:false',
      'topic:calendly-alternative archived:false fork:false',
    ]);
  });
});

describe('GithubBudget', () => {
  it('runs out when GitHub says fewer than the reserve remain', () => {
    const b = new GithubBudget(50);
    b.update(new Headers({ 'x-ratelimit-remaining': '10' }));
    expect(b.exhausted).toBe(true);
  });
  it('carries on while plenty remain', () => {
    const b = new GithubBudget(50);
    b.update(new Headers({ 'x-ratelimit-remaining': '4000' }));
    expect(b.exhausted).toBe(false);
  });
  it('stops a batch fetch with RateLimited once exhausted, before asking GitHub again', async () => {
    const b = new GithubBudget(50);
    b.update(new Headers({ 'x-ratelimit-remaining': '1' }));
    let called = false;
    const f = (async () => { called = true; return new Response('{}'); }) as unknown as typeof fetch;
    await expect(fetchRepoBatch(['a/b'], 't', b, f)).rejects.toBeInstanceOf(RateLimited);
    expect(called).toBe(false);
  });
});

describe('fetchRepoBatch', () => {
  it('maps a GraphQL answer into repo facts and help-wanted issues', async () => {
    const body = {
      data: {
        r0: {
          databaseId: 7, nameWithOwner: 'calcom/cal.com', url: 'https://github.com/calcom/cal.com', description: 'Scheduling',
          homepageUrl: 'https://cal.com', repositoryTopics: { nodes: [{ topic: { name: 'scheduling' } }] },
          licenseInfo: { spdxId: 'AGPL-3.0', name: 'GNU AGPL v3' }, stargazerCount: 38000, forkCount: 9000,
          isArchived: false, isFork: false, pushedAt: '2026-11-11T00:00:00Z', createdAt: '2021-04-01T00:00:00Z',
          issues: { totalCount: 400 }, helpWanted: { totalCount: 41 }, goodFirst: { totalCount: 12 },
          latestRelease: { tagName: 'v5.0', publishedAt: '2026-11-01T00:00:00Z' },
          helpIssues: { nodes: [{ number: 5, title: 'Add a minimum notice setting', url: 'https://github.com/calcom/cal.com/issues/5', comments: { totalCount: 2 }, updatedAt: '2026-11-10T00:00:00Z', labels: { nodes: [{ name: 'good first issue' }] } }] },
        },
        r1: null,
      },
    };
    const f = (async () => new Response(JSON.stringify(body), { headers: { 'x-ratelimit-remaining': '4999' } })) as unknown as typeof fetch;
    const out = await fetchRepoBatch(['calcom/cal.com', 'gone/repo'], 't', new GithubBudget(50), f);
    expect(out.repos).toHaveLength(1);
    expect(out.repos[0]).toMatchObject({ githubId: 7, fullName: 'calcom/cal.com', licenseSpdx: 'AGPL-3.0', stars: 38000, helpWanted: 41, goodFirst: 12, topics: ['scheduling'], latestReleaseTag: 'v5.0' });
    expect(out.issues.get('calcom/cal.com')).toEqual([{ number: 5, title: 'Add a minimum notice setting', url: 'https://github.com/calcom/cal.com/issues/5', labels: ['good first issue'], comments: 2, updatedAt: '2026-11-10T00:00:00Z' }]);
  });
  it('refuses more than 50 repos in one batch', async () => {
    await expect(fetchRepoBatch(Array.from({ length: 51 }, (_, i) => `a/r${i}`), 't', new GithubBudget(50))).rejects.toThrow(/50/);
  });
});

import { linkSource } from '../src/lib/sync/link';

describe('linkSource', () => {
  const product = { slug: 'calendly', name: 'Calendly', words: ['booking', 'appointments'], aliases: [], excludes: ['someone/wrong'] };
  it('links a repo tagged <slug>-alternative without further checks', () => {
    expect(linkSource(repo({ topics: ['calendly-alternative'], description: 'Something' }), product, ['tag'])).toBe('tag');
  });
  it('links a topic match that mentions one of the product words', () => {
    expect(linkSource(repo({ description: 'Open source appointments for everyone' }), product, ['topic'])).toBe('topic');
  });
  it('refuses a topic match that shares no words with the product', () => {
    expect(linkSource(repo({ description: 'Distributed cron job scheduler', topics: ['scheduling'] }), product, ['topic'])).toBeNull();
  });
  it('refuses a repo the catalog excludes', () => {
    expect(linkSource(repo({ fullName: 'Someone/Wrong', topics: ['calendly-alternative'] }), product, ['tag'])).toBeNull();
  });
  it('prefers the strongest way it was found', () => {
    expect(linkSource(repo({ description: 'booking pages' }), product, ['search', 'topic'])).toBe('topic');
  });
});
