import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { visitorHash } from '../src/lib/analytics';
import { EVENT_KINDS, EVENT_LABELS, eventFor, eventSubject, recordEvent, SIGNUP_KINDS } from '../src/lib/events';
import { toCsv } from '../src/lib/intake';
import {
  AUTOMATED_NOTES, bars, buildEntries, change, conversion, describe as say, filterEntries, PEOPLE_CSV_HEADER, peopleCsvRows, percent,
  sourceText, timeline, type RawPeople,
} from '../src/lib/report';
import { sourceKey, sourceName, SOURCES, taggedLinks } from '../src/lib/sources';

const migration = readFileSync('supabase/migrations/0013_attribution.sql', 'utf8');
const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

describe('sourceKey', () => {
  it('folds well-known referring sites into one group each', () => {
    expect(sourceKey(null, 'x.com')).toBe('x');
    expect(sourceKey(null, 't.co')).toBe('x');
    expect(sourceKey(null, 'twitter.com')).toBe('x');
    expect(sourceKey(null, 'old.reddit.com')).toBe('reddit');
    expect(sourceKey(null, 'news.ycombinator.com')).toBe('hackernews');
    expect(sourceKey(null, 'github.com')).toBe('github');
    expect(sourceKey(null, 'lnkd.in')).toBe('linkedin');
    expect(sourceKey(null, 'tiktok.com')).toBe('tiktok');
    expect(sourceKey(null, 'youtu.be')).toBe('youtube');
    expect(sourceKey(null, 'chatgpt.com')).toBe('ai');
  });
  it('treats every search engine as search, including Google in any country', () => {
    for (const host of ['google.com', 'google.co.uk', 'google.de', 'bing.com', 'duckduckgo.com', 'search.brave.com', 'kagi.com']) expect(sourceKey(null, host)).toBe('search');
    expect(sourceKey(null, 'google.evil.example.com')).toBe('google.evil.example.com');
    expect(sourceKey(null, 'notgoogle.com')).toBe('notgoogle.com');
  });
  it('lets a tag on the link win over the referring site', () => {
    expect(sourceKey('x', 'reddit.com')).toBe('x');
    expect(sourceKey('HN', null)).toBe('hackernews');
    expect(sourceKey('twitter', null)).toBe('x');
    expect(sourceKey('newsletter', 'mail.google.com')).toBe('email');
  });
  it('keeps a tag or site it does not know exactly as it arrived', () => {
    expect(sourceKey('x-launch-thread', 'x.com')).toBe('x-launch-thread');
    expect(sourceKey(null, 'indiehackers.com')).toBe('indiehackers.com');
  });
  it('calls a visit with neither a tag nor a referring site direct', () => {
    expect(sourceKey(null, null)).toBe('direct');
    expect(sourceKey('', '')).toBe('direct');
    expect(sourceKey(undefined, undefined)).toBe('direct');
  });
  it('has a readable name for every group', () => {
    expect(sourceName('x')).toBe('X');
    expect(sourceName('hackernews')).toBe('Hacker News');
    expect(sourceName('direct')).toBe('Direct or unknown');
    expect(sourceName('indiehackers.com')).toBe('indiehackers.com');
  });
  it('is the same table the database groups by', () => {
    // Every tag and host named here must be in the database function, under the same key.
    for (const s of SOURCES) {
      const line = migration.split('\n').find((l) => l.includes(`then '${s.key}'`) || (s.key === 'search' && l.includes("'google', 'bing'")));
      expect(line, s.key).toBeTruthy();
      const block = s.key === 'search' ? migration.slice(migration.indexOf("when p in ('google', 'bing'"), migration.indexOf("then 'search'")) : line!;
      for (const word of [...s.tags, ...s.hosts]) expect(block, `${s.key}: ${word}`).toContain(`'${word}'`);
      // And nothing is in the database's list for this key that is missing here.
      const inSql = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((w) => w !== s.key || s.tags.includes(w) || s.hosts.includes(w));
      for (const word of inSql) if (!word.startsWith('^')) expect([...s.tags, ...s.hosts, s.key], `${s.key}: ${word}`).toContain(word);
    }
    expect(migration).toContain("p ~ '^google\\.[a-z.]{2,6}$'");
  });
  it('gives links to paste, one per place, that come back under that place', () => {
    const links = taggedLinks('https://www.antipaywall.org/');
    expect(links.find((l) => l.where === 'X')?.link).toBe('https://www.antipaywall.org/?ref=x');
    for (const l of links) {
      const tag = new URL(l.link).searchParams.get('ref');
      expect(sourceName(sourceKey(tag, null))).toBe(l.where);
    }
  });
});

describe('eventFor', () => {
  const make = (over: Partial<Parameters<typeof eventFor>[0]> = {}, headers: Record<string, string> = {}) =>
    eventFor({
      kind: 'list_joined', subject: '3f1c2b9a-0d4e-4c1a-9b7e-2a6d5e4f3c21',
      headers: new Headers({ 'user-agent': CHROME, 'x-vercel-ip-country': 'DE', ...headers }),
      ip: '203.0.113.77', key: 'k'.repeat(40), now: new Date('2026-11-12T23:59:59Z'), organizer: false, ...over,
    });
  it('carries the same one-day code as a page view from the same browser and network', () => {
    const e = make();
    expect(e.day).toBe('2026-11-12');
    expect(e.visitor).toBe(visitorHash('k'.repeat(40), '2026-11-12', '203.0.113.77', CHROME));
    expect(e).toEqual({ day: '2026-11-12', visitor: e.visitor, kind: 'list_joined', person_id: null, subject: '3f1c2b9a-0d4e-4c1a-9b7e-2a6d5e4f3c21', country: 'DE' });
  });
  it('stores no address, browser name or free text', () => {
    const e = make({ subject: 'someone@example.com' });
    expect(e.subject).toBeNull();
    expect(JSON.stringify(e)).not.toContain('203.0.113.77');
    expect(JSON.stringify(e)).not.toContain('Chrome');
    expect(make({ subject: 'a message with spaces' }).subject).toBeNull();
    expect(make({ subject: 'brand-kit-skill' }).subject).toBe('brand-kit-skill');
  });
  it('has no code for the organizer, for a mail app, or when there is nothing to make one from', () => {
    expect(make({ organizer: true }).visitor).toBeNull();
    expect(make({ anonymous: true }).visitor).toBeNull();
    expect(make({ key: '' }).visitor).toBeNull();
    expect(make({ ip: '' }).visitor).toBeNull();
    expect(eventFor({ kind: 'hearted', headers: new Headers(), ip: '203.0.113.77', key: 'k', now: new Date(), organizer: false }).visitor).toBeNull();
  });
  it('changes with the day, so an action can only be matched to the same day', () => {
    expect(make({ now: new Date('2026-11-13T00:00:01Z') }).visitor).not.toBe(make().visitor);
  });
  it('accepts only short references as a subject', () => {
    expect(eventSubject('a'.repeat(81))).toBeNull();
    expect(eventSubject('a.b')).toBeNull();
    expect(eventSubject(null)).toBeNull();
    expect(eventSubject('ok_1-2')).toBe('ok_1-2');
  });
});

describe('recordEvent', () => {
  const context = { request: new Request('https://www.antipaywall.org/api/subscribe', { headers: { 'user-agent': CHROME } }), clientAddress: '203.0.113.77', locals: { person: null } } as any;
  it('writes nothing away from the live site', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    const insert = vi.fn(async () => ({ error: null }));
    await recordEvent({ from: () => ({ insert }) } as any, context, { kind: 'hearted', subject: 'an-idea' });
    expect(insert).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
  it('writes one row on the live site', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    const insert = vi.fn(async (_row: unknown) => ({ error: null }));
    const from = vi.fn((_table: string) => ({ insert }));
    await recordEvent({ from } as any, context, { kind: 'hearted', subject: 'an-idea' });
    expect(from).toHaveBeenCalledWith('events');
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toMatchObject({ kind: 'hearted', subject: 'an-idea', person_id: null });
    vi.unstubAllEnvs();
  });
  it('never breaks the action it is part of, whatever the database does', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    const failing = [
      { from: () => ({ insert: async () => ({ error: { message: 'down' } }) }) },
      { from: () => ({ insert: () => Promise.reject(new Error('network')) }) },
      { from: () => { throw new Error('no client'); } },
      { from: () => ({ insert: () => new Promise(() => {}) }) },
    ];
    for (const db of failing) await expect(recordEvent(db as any, context, { kind: 'pledged', personId: 'p' })).resolves.toBeUndefined();
    vi.unstubAllEnvs();
  });
  it('is called after the save in every route that records something, never before it', () => {
    const routes: [string, string][] = [
      ['src/pages/api/subscribe.ts', 'addToList('], ['src/pages/api/heart.ts', ".upsert(key"], ['src/pages/api/ideas.ts', 'storeIdea('],
      ['src/pages/api/join.ts', ".update({"], ['src/pages/api/pledge.ts', "rpc('replace_pledge'"], ['src/pages/api/panel.ts', '.upsert({'],
      ['src/pages/api/organize.ts', '.upsert({'], ['src/pages/api/sponsor-inquiry.ts', "rpc('save_sponsor_inquiry'"], ['src/pages/auth/callback.ts', ".upsert({"],
    ];
    for (const [file, save] of routes) {
      const source = readFileSync(file, 'utf8');
      expect(source.indexOf(save), file).toBeGreaterThan(-1);
      expect(source.indexOf('await recordEvent('), file).toBeGreaterThan(source.indexOf(save));
    }
    expect(readFileSync('src/lib/list.ts', 'utf8')).toMatch(/rpc\('unsubscribe'[\s\S]*await recordEvent\(/);
  });
});

describe('the kinds of action', () => {
  it('are the same list in the code and in the database', () => {
    for (const k of EVENT_KINDS) {
      expect(migration, k).toContain(`'${k}'`);
      expect(EVENT_LABELS[k]).toBeTruthy();
    }
    const check = migration.slice(migration.indexOf('kind text not null check (kind in ('), migration.indexOf('person_id uuid'));
    expect([...check.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()).toEqual([...EVENT_KINDS].sort());
  });
  it('count the same things as a sign-up in the code and in the database', () => {
    const fn = migration.slice(migration.indexOf('create function public.signup_kinds()'));
    const list = fn.slice(fn.indexOf('select array['), fn.indexOf('];'));
    expect([...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()).toEqual([...SIGNUP_KINDS].sort());
    expect(SIGNUP_KINDS).not.toContain('hearted');
    expect(SIGNUP_KINDS).not.toContain('unsubscribed');
  });
});

describe('conversion', () => {
  it('is the share of visitors who signed up, to one decimal', () => {
    expect(conversion(1, 3)).toBe(33.3);
    expect(conversion(5, 82)).toBe(6.1);
    expect(conversion(0, 10)).toBe(0);
    expect(conversion(10, 10)).toBe(100);
    expect(percent(1, 8)).toBe('12.5%');
  });
  it('is not a number when there were no visitors', () => {
    expect(conversion(0, 0)).toBeNull();
    expect(percent(3, 0)).toBe('–');
  });
  it('compares today with yesterday only when there is a yesterday', () => {
    expect(change(120, 100)).toEqual({ text: '+20% on yesterday', up: true });
    expect(change(50, 100)).toEqual({ text: '-50% on yesterday', up: false });
    expect(change(100, 100)).toEqual({ text: '0% on yesterday', up: true });
    expect(change(10, 0)).toBeNull();
  });
});

describe('timeline', () => {
  const pages = [
    { at: '2026-11-12T10:00:05Z', path: '/join' },
    { at: '2026-11-12T10:00:00Z', path: '/' },
    { at: '2026-11-12T10:02:00Z', path: '/join/build' },
  ];
  const events = [
    { at: '2026-11-12T10:01:00Z', kind: 'signed_in' as const, subject: null },
    { at: '2026-11-12T10:03:00Z', kind: 'hearted' as const, subject: 'brand-kit' },
  ];
  it('puts pages and actions in the order they happened', () => {
    expect(timeline(pages, events).map((s) => s.text)).toEqual(['/', '/join', 'Signed in', '/join/build', 'Hearted an idea: brand-kit']);
    expect(timeline(pages, events).map((s) => s.type)).toEqual(['page', 'page', 'did', 'page', 'did']);
  });
  it('puts the page first when a page and an action share a moment', () => {
    const same = timeline([{ at: '2026-11-12T10:00:00Z', path: '/fund' }], [{ at: '2026-11-12T10:00:00.000Z', kind: 'pledged', subject: 'x' }]);
    expect(same.map((s) => s.type)).toEqual(['page', 'did']);
  });
  it('handles a visit with no actions and an action with no pages', () => {
    expect(timeline(pages, []).length).toBe(3);
    expect(timeline([], events).map((s) => s.type)).toEqual(['did', 'did']);
  });
  it('never prints an id', () => {
    expect(say('pledged', '3f1c2b9a-0d4e-4c1a-9b7e-2a6d5e4f3c21')).toBe('Pledged');
    expect(say('list_joined', '3f1c2b9a-0d4e-4c1a-9b7e-2a6d5e4f3c21')).toBe('Joined the email list');
    expect(say('idea_posted', 'brand-kit')).toBe('Posted an idea: brand-kit');
  });
});

describe('sourceText', () => {
  const base = { source: 'direct', referrer_host: null, utm_source: null };
  it('names the group and shows what it was read from', () => {
    expect(sourceText(base)).toBe('Direct or unknown');
    expect(sourceText({ source: 'x', referrer_host: 't.co', utm_source: null })).toBe('X (t.co)');
    expect(sourceText({ source: 'x', referrer_host: null, utm_source: 'x', utm_campaign: 'launch' })).toBe('X (tag "x", campaign "launch")');
    expect(sourceText({ source: 'indiehackers.com', referrer_host: 'indiehackers.com', utm_source: null })).toBe('indiehackers.com');
  });
});

describe('the possibly-automated marker', () => {
  it('explains every mark the database can give', () => {
    const marks = [...migration.matchAll(/then '(fast|inner|burst)'/g)].map((m) => m[1]).sort();
    expect(marks).toEqual(['burst', 'fast', 'inner']);
    expect(Object.keys(AUTOMATED_NOTES).sort()).toEqual(marks);
    for (const note of Object.values(AUTOMATED_NOTES)) expect(note.length).toBeGreaterThan(40);
  });
  it('is never given to a visit that did something, and is checked in that order', () => {
    const rule = migration.slice(migration.indexOf('when j.acted then null'), migration.indexOf("then 'burst'"));
    expect(rule.startsWith('when j.acted then null')).toBe(true);
    expect(rule).toContain("j.views >= 3 and j.last_at - j.first_at < (j.views - 1) * interval '1 second'");
    expect(rule).toContain("j.bare and j.landing <> '/' and j.landing not like '/ideas/%'");
    expect(rule).toContain('>= 5');
    // "bare": one view, nothing done, no referring site, no tag.
    expect(migration).toContain('(d.views = 1 and e.visitor is null and d.referrer_host is null and d.utm_source is null) as bare');
  });
  it('is only ever left out of the numbers when asked', () => {
    expect(migration).toContain('p_humans boolean default false');
    expect(migration.match(/where not p_humans or x\.automated is null/g)?.length).toBe(2);
    expect(migration).not.toMatch(/delete from public\.(page_views|events)/);
  });
});

const raw: RawPeople = {
  people: [
    {
      id: 'p1', handle: 'ada', github_id: 1, verified: true, failed_rules: [], is_builder: true, country: 'GB',
      created_at: '2026-11-12T10:01:00Z', joined_at: '2026-11-12T10:04:00Z', last_at: '2026-11-12T10:06:00Z',
      emails: [{ email: 'ada@example.com', source: 'github', subscribed_at: '2026-11-12T10:01:01Z', unsubscribed_at: null }],
      pledges: [{ amount_cents: 5000, status: 'listed', name: 'Ada', at: '2026-11-12T10:06:00Z' }],
      ideas: [], panel: false, organize: true,
      events: [
        { at: '2026-11-12T10:01:00Z', kind: 'signed_in', subject: null, day: '2026-11-12', visitor: 'aaaaaaaaaaaaaaaa', untracked: false },
        { at: '2026-11-12T10:06:00Z', kind: 'pledged', subject: 'g1', day: '2026-11-12', visitor: 'aaaaaaaaaaaaaaaa', untracked: false },
      ],
    },
    {
      id: 'p2', handle: 'old-timer', provider: 'gitlab', github_id: null, verified: false, failed_rules: ['account_age'], is_builder: false, country: null,
      created_at: '2026-11-11T09:00:00Z', joined_at: null, last_at: '2026-11-11T09:00:00Z',
      emails: [{ email: 'old@example.com', source: 'github', subscribed_at: '2026-11-11T09:00:00Z', unsubscribed_at: '2026-11-11T12:00:00Z' }],
      pledges: [], ideas: [{ slug: 'a', title: 'A', at: '2026-11-11T09:30:00Z' }], panel: true, organize: false,
      events: [{ at: '2026-11-11T09:00:00Z', kind: 'signed_in', subject: null, day: '2026-11-11', visitor: null, untracked: true }],
    },
  ],
  contacts: [
    {
      email: '=cmd@example.com', last_at: '2026-11-12T11:00:00Z',
      list: { source: 'form', country: 'US', subscribed_at: '2026-11-12T08:00:00Z', unsubscribed_at: null },
      inquiries: [{ company: 'Acme', contact: 'Sam', kind: 'pool', amount_usd: 2500, country: 'US', at: '2026-11-12T11:00:00Z' }],
      events: [{ at: '2026-11-12T08:00:00Z', kind: 'list_joined', subject: 's1', day: '2026-11-12', visitor: 'bbbbbbbbbbbbbbbb', untracked: false }],
    },
  ],
  journeys: [
    {
      day: '2026-11-12', visitor: 'aaaaaaaaaaaaaaaa', first_at: '2026-11-12T10:00:00Z', landing: '/', source: 'x', referrer_host: null,
      utm_source: 'x', utm_medium: null, utm_campaign: null, device: 'mobile', country: 'GB', views: 3,
      pages: [{ at: '2026-11-12T10:00:00Z', path: '/' }, { at: '2026-11-12T10:00:30Z', path: '/join/build' }, { at: '2026-11-12T10:05:00Z', path: '/fund' }],
    },
    {
      day: '2026-11-12', visitor: 'bbbbbbbbbbbbbbbb', first_at: '2026-11-12T07:59:00Z', landing: '/join', source: 'reddit', referrer_host: 'reddit.com',
      utm_source: null, utm_medium: null, utm_campaign: null, device: 'desktop', country: 'US', views: 1, pages: [{ at: '2026-11-12T07:59:00Z', path: '/join' }],
    },
  ],
};

describe('the people table', () => {
  const entries = buildEntries(raw);
  it('lists each person once, newest activity first, with everything they signed up for', () => {
    expect(entries.map((e) => e.key)).toEqual(['=cmd@example.com', 'p1', 'p2']);
    const ada = entries.find((e) => e.key === 'p1')!;
    expect(ada.signedUpFor).toEqual(['Signed in with GitHub', 'Builder', 'Email list', 'Pledged $50 (listed)', 'Offered to help organize']);
    expect(ada.checks).toBe('Passed the builder checks');
    const old = entries.find((e) => e.key === 'p2')!;
    expect(old.signedUpFor).toEqual(['Signed in with GitLab', 'Email list (unsubscribed)', 'Posted an idea', 'Applied to the review panel']);
    expect(old.checks).toBe('Did not pass: account_age');
  });
  it('links each account to its own provider in the export', () => {
    const rows = peopleCsvRows(entries);
    expect(rows.find((r) => r[0] === 'ada')!.slice(1, 3)).toEqual(['GitHub account', 'https://github.com/ada']);
    expect(rows.find((r) => r[0] === 'old-timer')!.slice(1, 3)).toEqual(['GitLab account', 'https://gitlab.com/old-timer']);
    expect(rows.find((r) => r[0] === '=cmd@example.com')!.slice(1, 3)).toEqual(['address only', '']);
  });
  it('joins an address with no account to its own list entry and sponsor inquiry', () => {
    const c = entries[0];
    expect(c.type).toBe('contact');
    expect(c.signedUpFor).toEqual(['Email list', 'Sponsor inquiry from Acme, about $2,500']);
    expect(c.firstAt).toBe('2026-11-12T08:00:00Z');
  });
  it('ties each person to the visit behind their actions, and to nobody else\'s', () => {
    const ada = entries.find((e) => e.key === 'p1')!;
    expect(ada.journeys.map((j) => j.visitor)).toEqual(['aaaaaaaaaaaaaaaa']);
    expect(entries[0].journeys.map((j) => j.landing)).toEqual(['/join']);
    expect(entries.find((e) => e.key === 'p2')!.journeys).toEqual([]);
  });
  it('filters by what people signed up for and searches by handle or address', () => {
    const keys = (kind: string | null, q = '') => filterEntries(entries, { kind, q }).map((e) => e.key);
    expect(keys('builder')).toEqual(['p1']);
    expect(keys('list')).toEqual(['=cmd@example.com', 'p1', 'p2']);
    expect(keys('sponsor')).toEqual(['=cmd@example.com']);
    expect(keys('panel')).toEqual(['p2']);
    expect(keys('account')).toEqual(['p1', 'p2']);
    expect(keys('all', '@ADA')).toEqual(['p1']);
    expect(keys('all', 'old@')).toEqual(['p2']);
    expect(keys('nonsense').length).toBe(3);
    expect(keys(null).length).toBe(3);
  });
  it('exports one row each, with where they came from, and cannot be run as a formula', () => {
    const rows = peopleCsvRows(entries);
    expect(rows.every((r) => r.length === PEOPLE_CSV_HEADER.length)).toBe(true);
    const ada = rows.find((r) => r[0] === 'ada')!;
    expect(ada[PEOPLE_CSV_HEADER.indexOf('source')]).toBe('X (tag "x")');
    expect(ada[PEOPLE_CSV_HEADER.indexOf('landing_page')]).toBe('/');
    expect(ada[PEOPLE_CSV_HEADER.indexOf('pages_viewed')]).toBe('/ > /join/build > /fund');
    const csv = toCsv(PEOPLE_CSV_HEADER, rows);
    expect(csv).toContain(`"'=cmd@example.com"`);
    expect(csv).not.toMatch(/(^|,)"=/m);
    expect(csv.split('\r\n')[0]).toBe(PEOPLE_CSV_HEADER.map((h) => `"${h}"`).join(','));
  });
});

describe('bars', () => {
  it('scales to the tallest value and keeps small values visible', () => {
    const b = bars([0, 1, 100], 300, 150);
    expect(b[0].h).toBe(0);
    expect(b[1].h).toBe(2);
    expect(b[2].h).toBe(142);
    expect(b[2].y).toBe(8);
    expect(b.every((r) => r.x >= 0 && r.x + r.w <= 300)).toBe(true);
  });
  it('copes with nothing at all', () => {
    expect(bars([], 300, 150)).toEqual([]);
    expect(bars([0, 0], 300, 150).every((r) => r.h === 0)).toBe(true);
  });
});
