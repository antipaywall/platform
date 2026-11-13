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
  it('links a topic match that shares two of the product words', () => {
    expect(linkSource(repo({ description: 'Open source booking and appointments for everyone' }), product, ['topic'])).toBe('topic');
  });
  it('refuses a topic match that shares no words with the product', () => {
    expect(linkSource(repo({ description: 'Distributed cron job scheduler', topics: ['scheduling'] }), product, ['topic'])).toBeNull();
  });
  it('refuses a repo the catalog excludes', () => {
    expect(linkSource(repo({ fullName: 'Someone/Wrong', topics: ['calendly-alternative'] }), product, ['tag'])).toBeNull();
  });
  it('prefers the strongest way it was found', () => {
    expect(linkSource(repo({ description: 'booking pages for appointments' }), product, ['search', 'topic'])).toBe('topic');
  });
});

import { fetchAllRows, relinkable, toUnlist } from '../src/lib/sync/plan';

describe('review fixes: sync', () => {
  it('fetchRepoBatch throws when GitHub answers with errors and no data, instead of reading it as "no repos"', async () => {
    const f = (async () => new Response(JSON.stringify({ errors: [{ message: 'something broke' }], data: null }), { headers: { 'x-ratelimit-remaining': '4000' } })) as unknown as typeof fetch;
    await expect(fetchRepoBatch(['a/b'], 't', new GithubBudget(50), f)).rejects.toThrow(/something broke/);
  });
  it('only relinks products whose searches all answered', () => {
    expect(relinkable(['calendly', 'notion'], new Set(['notion']))).toEqual(['calendly']);
  });
  it('unlists a listed repo that GitHub no longer returns or that now fails the filter', () => {
    expect(toUnlist(['a/one', 'b/two', 'c/three'], new Set(['a/one', 'c/three']), new Set(['a/one']))).toEqual(['b/two', 'c/three']);
  });
  it('reads past the 1,000-row page limit', async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => i);
    const page = async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null });
    expect(await fetchAllRows(page, 1000)).toHaveLength(2500);
  });
});

import { factsFromSearchItem } from '../src/lib/sync/github';

describe('factsFromSearchItem', () => {
  it('reads a search result into repo facts the filter can judge without another request', () => {
    const f = factsFromSearchItem({
      id: 7, full_name: 'calcom/cal.com', html_url: 'https://github.com/calcom/cal.com', description: 'Scheduling', homepage: '',
      topics: ['scheduling'], license: { spdx_id: 'AGPL-3.0', name: 'GNU AGPL v3' }, stargazers_count: 38000, forks_count: 9000,
      open_issues_count: 400, archived: false, fork: false, pushed_at: '2026-11-11T00:00:00Z', created_at: '2021-04-01T00:00:00Z',
    });
    expect(f).toMatchObject({ githubId: 7, fullName: 'calcom/cal.com', licenseSpdx: 'AGPL-3.0', stars: 38000, topics: ['scheduling'], homepage: null, archived: false });
  });
  it('leaves out the short code for a license GitHub labels NOASSERTION', () => {
    expect(factsFromSearchItem({ id: 1, full_name: 'a/b', html_url: 'https://github.com/a/b', license: { spdx_id: 'NOASSERTION', name: 'Other' } } as any)?.licenseSpdx).toBeNull();
  });
  it('drops an item that is not a GitHub repo', () => {
    expect(factsFromSearchItem({ id: 1, full_name: 'a/b', html_url: 'https://evil.example/a/b' } as any)).toBeNull();
  });
});

import { fetchReposResilient } from '../src/lib/sync/github';

describe('fetchReposResilient', () => {
  const ok = (names: string[]) => ({ data: Object.fromEntries(names.map((n, i) => [`r${i}`, { databaseId: i + 1, nameWithOwner: n, url: `https://github.com/${n}`, createdAt: '2024-01-01T00:00:00Z', pushedAt: '2026-11-01T00:00:00Z' }])) });
  it('splits a batch GitHub times out on, and still reads every repo', async () => {
    let calls = 0;
    const f = (async (_u: string, init: any) => {
      calls++;
      const n = (JSON.parse(init.body).query.match(/repository\(/g) ?? []).length;
      if (n > 2) return new Response('bad gateway', { status: 502 });
      const names = [...JSON.parse(init.body).query.matchAll(/owner: "([^"]+)", name: "([^"]+)"/g)].map((m) => `${m[1]}/${m[2]}`);
      return new Response(JSON.stringify(ok(names)), { headers: { 'x-ratelimit-remaining': '4000' } });
    }) as unknown as typeof fetch;
    const out = await fetchReposResilient(['a/1', 'a/2', 'a/3', 'a/4', 'a/5'], 't', new GithubBudget(50), f, 0);
    expect(out.repos.map((r) => r.fullName).sort()).toEqual(['a/1', 'a/2', 'a/3', 'a/4', 'a/5']);
    expect(calls).toBeGreaterThan(1);
  });
  it('gives up on a single repo that keeps failing, without stopping the rest', async () => {
    const f = (async (_u: string, init: any) => {
      const names = [...JSON.parse(init.body).query.matchAll(/owner: "([^"]+)", name: "([^"]+)"/g)].map((m) => `${m[1]}/${m[2]}`);
      if (names.includes('bad/one')) return new Response('bad gateway', { status: 502 });
      return new Response(JSON.stringify(ok(names)), { headers: { 'x-ratelimit-remaining': '4000' } });
    }) as unknown as typeof fetch;
    const out = await fetchReposResilient(['bad/one', 'good/two'], 't', new GithubBudget(50), f, 0);
    expect(out.repos.map((r) => r.fullName)).toEqual(['good/two']);
    expect(out.failed).toEqual(['bad/one']);
  });
});

import { pointsFromSnapshots } from '../src/lib/sync/stars';

describe('pointsFromSnapshots', () => {
  it('draws the curve from the daily counts the sync saves, oldest first', () => {
    expect(pointsFromSnapshots([{ day: '2026-11-14', stars: 12 }, { day: '2026-11-13', stars: 10 }])).toEqual([['2026-11-13', 10], ['2026-11-14', 12]]);
  });
  it('is empty with no counts', () => {
    expect(pointsFromSnapshots([])).toEqual([]);
  });
});

describe('linkSource is strict about broad topics', () => {
  const calendly = { slug: 'calendly', name: 'Calendly', words: ['booking', 'appointments', 'scheduling', 'meeting link', 'calendar'], aliases: [], excludes: [] };
  it('drops a pipeline tool that only shares the word "scheduling"', () => {
    expect(linkSource(repo({ fullName: 'spotify/luigi', description: 'Build complex pipelines of batch jobs', topics: ['python', 'scheduling', 'hadoop'] }), calendly, ['topic'])).toBeNull();
  });
  it('keeps a booking app that shares several of the product words', () => {
    expect(linkSource(repo({ fullName: 'alextselegidis/easyappointments', description: 'Online appointments scheduler for booking', topics: ['scheduling'] }), calendly, ['topic'])).toBe('topic');
  });
  it('keeps a repo that names the product', () => {
    expect(linkSource(repo({ fullName: 'x/y', description: 'An open source Calendly', topics: [] }), calendly, ['search'])).toBe('search');
  });
});

describe('licenses GitHub cannot name', () => {
  it('keeps a repo whose license GitHub labels NOASSERTION: it has one, GitHub just could not name it', () => {
    const f = factsFromSearchItem({ id: 1, full_name: 'n8n-io/n8n', html_url: 'https://github.com/n8n-io/n8n', license: { spdx_id: 'NOASSERTION', name: 'Other' }, stargazers_count: 100000, pushed_at: '2026-11-12T00:00:00Z' });
    expect(f?.licenseSpdx).toBeNull();
    expect(f?.licenseName).toBe('Other');
    expect(passesFilter(f!, blocklist, now)).toEqual({ ok: true });
  });
  it('still turns away a repo with no license file at all', () => {
    const f = factsFromSearchItem({ id: 2, full_name: 'a/b', html_url: 'https://github.com/a/b', license: null, stargazers_count: 100, pushed_at: '2026-11-12T00:00:00Z' });
    expect(passesFilter(f!, blocklist, now)).toEqual({ ok: false, reason: 'no_license' });
  });
});

describe('plainLicense for licenses GitHub cannot name', () => {
  it('says the project has its own or several licenses, never "no license"', () => {
    const l = plainLicense(null, 'Other');
    expect(l.label).toBe('Own license');
    expect(l.words).toMatch(/license file/);
  });
});
