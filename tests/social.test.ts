import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildWall, fetchGithubActivity, fetchGitlabActivity, savedActivity, ActivityUnavailableError } from '../src/lib/activity';
import { badgesFor, topBadge } from '../src/lib/badges';
import { parsePost } from '../src/lib/forms';
import { safeBack } from '../src/lib/respond';
import { ago } from '../src/lib/social';

const now = new Date('2026-11-12T15:00:00Z');

describe('buildWall', () => {
  it('lays out 365 days ending today, with stats', () => {
    const w = buildWall({ '2026-11-12': 5, '2026-11-11': 1, '2026-11-10': 2, '2026-01-01': 9, '2025-01-01': 99 }, now);
    expect(w.days).toBe(365);
    expect(w.bricks).toHaveLength(365);
    expect(w.bricks.at(-1)).toMatchObject({ day: '2026-11-12', count: 5 });
    expect(w.total).toBe(17); // the day from 2025 is outside the year
    expect(w.activeDays).toBe(4);
    expect(w.longestStreak).toBe(3);
    expect(w.busiest).toEqual({ day: '2026-01-01', count: 9 });
  });
  it('gives empty days level 0 and the busiest days the top level', () => {
    const w = buildWall({ '2026-11-12': 50, '2026-11-11': 1 }, now);
    expect(w.bricks.find((b) => b.day === '2026-11-12')!.level).toBe(4);
    expect(w.bricks.find((b) => b.day === '2026-11-01')!.level).toBe(0);
  });
  it('shifts every other row by half a brick, like brickwork, and fits its own width', () => {
    const w = buildWall({}, now);
    const rows = new Map<number, number>();
    for (const b of w.bricks) if (!rows.has(b.y)) rows.set(b.y, b.x % 12);
    expect(new Set([...rows.values()]).size).toBe(2);
    expect(Math.max(...w.bricks.map((b) => b.x + 10))).toBeLessThanOrEqual(w.width);
    expect(w.longestStreak).toBe(0);
    expect(w.busiest).toBeNull();
  });
});

describe('fetchGithubActivity', () => {
  const calendar = { data: { user: { contributionsCollection: { contributionCalendar: { weeks: [{ contributionDays: [{ date: '2026-11-10', contributionCount: 7 }, { date: '2026-11-11', contributionCount: 0 }] }] } } } } };
  const quarter = { data: { user: { contributionsCollection: {
    commitContributionsByRepository: [
      { repository: { isPrivate: false }, contributions: { nodes: [{ occurredAt: '2026-11-10T08:00:00Z', commitCount: 3 }] } },
      { repository: { isPrivate: true }, contributions: { nodes: [{ occurredAt: '2026-11-10T08:00:00Z', commitCount: 4 }] } },
    ],
    pullRequestContributions: { nodes: [{ occurredAt: '2026-11-11T09:00:00Z', pullRequest: { repository: { isPrivate: false } } }, { occurredAt: '2026-11-11T09:00:00Z', pullRequest: { repository: { isPrivate: true } } }] },
    issueContributions: { nodes: [] },
    pullRequestReviewContributions: { nodes: [{ occurredAt: '2026-11-11T10:00:00Z', pullRequestReview: { repository: { isPrivate: false } } }] },
  } } } };
  it('counts public repositories only for "public", and everything for "all"', async () => {
    let first = true;
    const f = (async () => {
      const body = first ? calendar : quarter;
      first = false;
      return new Response(JSON.stringify(body));
    }) as unknown as typeof fetch;
    const got = await fetchGithubActivity('a', 'tok', now, f);
    expect(got.all).toEqual({ '2026-11-10': 7 });
    // Four quarters each answered with the same sample: 3 commits and 2 public PR/review per quarter.
    expect(got.public).toEqual({ '2026-11-10': 12, '2026-11-11': 8 });
  });
  it('throws ActivityUnavailableError when GitHub does not answer', async () => {
    const f = (async () => new Response('no', { status: 502 })) as unknown as typeof fetch;
    await expect(fetchGithubActivity('a', 'tok', now, f)).rejects.toBeInstanceOf(ActivityUnavailableError);
  });
});

describe('fetchGitlabActivity and savedActivity', () => {
  it('reads the public calendar for both views', async () => {
    const f = (async () => new Response(JSON.stringify({ '2026-11-10': 2, nonsense: 5, '2026-11-11': -1 }))) as unknown as typeof fetch;
    expect(await fetchGitlabActivity('t', f)).toEqual({ public: { '2026-11-10': 2 }, all: { '2026-11-10': 2 } });
  });
  it('drops anything malformed from a saved copy', () => {
    expect(savedActivity({ public: { '2026-11-10': 3, bad: 1, '2026-11-11': 1.5 }, all: 'x' })).toEqual({ public: { '2026-11-10': 3 }, all: {} });
    expect(savedActivity(null)).toEqual({ public: {}, all: {} });
  });
});

describe('badgesFor', () => {
  it('puts the most important badge first, so it sits next to the name', () => {
    const b = badgesFor({ verified: true, is_builder: true }, [{ kind: 'founder', season: null, place: null, note: null }], { backer: true });
    expect(b.map((x) => x.kind)).toEqual(['founder', 'builder', 'season', 'backer']);
    expect(topBadge(b)?.label).toBe('Founding organizer');
  });
  it('earns Builder from the checks and Season 1 builder from joining, separately', () => {
    expect(badgesFor({ verified: true, is_builder: false }, []).map((x) => x.kind)).toEqual(['builder']);
    expect(badgesFor({ verified: false, is_builder: false }, [])).toEqual([]);
    expect(topBadge([])).toBeNull();
  });
  it('names a winner by place and season', () => {
    expect(badgesFor({}, [{ kind: 'winner', season: 1, place: 2, note: null }])[0].label).toBe('2nd, Season 1');
  });
});

describe('parsePost', () => {
  it('keeps line breaks, trims, and adds https to a bare link', () => {
    expect(parsePost({ kind: 'team', body: '  Need a designer.  \n\n\n\nDM me  ', link: 'example.com/x' }, false)).toEqual({
      ok: true, post: { kind: 'team', body: 'Need a designer.\n\nDM me', linkUrl: 'https://example.com/x' },
    });
  });
  it('needs a kind on a post but never on a reply', () => {
    expect(parsePost({ body: 'hi' }, false)).toEqual({ ok: false, error: 'need_kind' });
    expect(parsePost({ kind: 'team', body: 'hi', link: 'x.com' }, true)).toEqual({ ok: true, post: { kind: null, body: 'hi', linkUrl: null } });
  });
  it('refuses empty, too long, and bad links', () => {
    expect(parsePost({ kind: 'update', body: '   ' }, false)).toEqual({ ok: false, error: 'need_post' });
    expect(parsePost({ kind: 'update', body: 'x'.repeat(501) }, false)).toEqual({ ok: false, error: 'bad_post' });
    expect(parsePost({ kind: 'update', body: 'x', link: 'javascript:alert(1)' }, false)).toEqual({ ok: false, error: 'bad_site' });
    expect(parsePost({ kind: 'bogus', body: 'x' }, false)).toEqual({ ok: false, error: 'need_kind' });
  });
});

describe('safeBack', () => {
  it('allows our own pages with a plain query and #section, and drops an old message', () => {
    expect(safeBack('/feed?tab=everyone&sort=latest&m=posted#post-1')).toBe('/feed?tab=everyone&sort=latest#post-1');
    expect(safeBack('/builders/gitlab/tanuki.dev')).toBe('/builders/gitlab/tanuki.dev');
  });
  it.each(['//evil.example', 'https://evil.example', '/a b', '/x?y=<script>', null, 7])('refuses %s', (v) => {
    expect(safeBack(v)).toBe('/feed');
  });
});

describe('ago', () => {
  it('says how long ago in short form', () => {
    expect(ago('2026-11-12T14:59:30Z', now)).toBe('now');
    expect(ago('2026-11-12T14:30:00Z', now)).toBe('30m');
    expect(ago('2026-11-12T10:00:00Z', now)).toBe('5h');
    expect(ago('2026-11-10T15:00:00Z', now)).toBe('2d');
    expect(ago('2026-10-01T15:00:00Z', now)).toBe('Oct 1');
  });
});

describe('the social migration', () => {
  const sql = readFileSync(new URL('../supabase/migrations/0017_social.sql', import.meta.url), 'utf8');
  it('only adds: nothing the live site uses is dropped, renamed or changed', () => {
    expect(sql).not.toMatch(/\bdrop\s+(table|column|function|index)\b/i);
    expect(sql).not.toMatch(/\brename\b/i);
    expect(sql).not.toMatch(/alter\s+column/i);
  });
  it('locks every new table and keeps the ranking function server-only', () => {
    for (const t of ['posts', 'post_bricks', 'follows', 'post_reports', 'badges']) expect(sql).toContain(`alter table public.${t} enable row level security`);
    expect(sql).toContain('revoke execute on function public.feed_top(int, int, text, boolean) from public, anon, authenticated');
    expect(sql).not.toMatch(/create policy/i);
  });
  it('allows only one founding organizer', () => {
    expect(sql).toContain("create unique index badges_one_founder on public.badges (kind) where kind = 'founder'");
  });
});
