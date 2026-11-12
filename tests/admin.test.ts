import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ADMIN_HEADERS, isAdminIn, isAdminPath, parseAdminIds } from '../src/lib/admin';

const person = (github_id: number | string) => ({ github_id });

describe('parseAdminIds', () => {
  it('reads whole numbers separated by commas', () => {
    expect(parseAdminIds('583231')).toEqual([583231]);
    expect(parseAdminIds(' 1 , 22,333 ')).toEqual([1, 22, 333]);
  });
  it('gives nobody access when the setting is empty or missing', () => {
    for (const raw of [undefined, null, '', ' ', ',', ',,']) expect(parseAdminIds(raw)).toEqual([]);
  });
  it('drops anything that is not a plain positive whole number', () => {
    for (const raw of ['abc', '12abc', '1e3', '-5', '0', '1.5', '0x10', 'true', '*', 'undefined', 'NaN', '12 34']) expect(parseAdminIds(raw)).toEqual([]);
    expect(parseAdminIds('abc,42,*')).toEqual([42]);
  });
});

describe('isAdmin', () => {
  const ids = parseAdminIds('583231');
  it('is false when nobody is signed in', () => {
    expect(isAdminIn(ids, null)).toBe(false);
    expect(isAdminIn(ids, undefined)).toBe(false);
    // A GitLab account has no GitHub id, so it can never be the organizer, whatever its GitLab id is.
    expect(isAdminIn(ids, { github_id: null })).toBe(false);
  });
  it('is false for a signed-in person who is not listed', () => {
    expect(isAdminIn(ids, person(583232))).toBe(false);
    expect(isAdminIn(ids, person(1))).toBe(false);
  });
  it('is false for everyone when the setting is empty or malformed', () => {
    for (const raw of [undefined, '', 'abc', '0', ',']) {
      expect(isAdminIn(parseAdminIds(raw), person(583231))).toBe(false);
      expect(isAdminIn(parseAdminIds(raw), person(0))).toBe(false);
      expect(isAdminIn(parseAdminIds(raw), person(NaN))).toBe(false);
      expect(isAdminIn(parseAdminIds(raw), null)).toBe(false);
    }
  });
  it('is true only for a listed id', () => {
    expect(isAdminIn(ids, person(583231))).toBe(true);
    expect(isAdminIn(ids, person('583231'))).toBe(true);
    expect(isAdminIn(parseAdminIds('1,583231'), person(583231))).toBe(true);
  });
  it('is what the site itself uses, with the ids from ADMIN_GITHUB_IDS', async () => {
    vi.stubEnv('ADMIN_GITHUB_IDS', '583231');
    vi.resetModules();
    const { isAdmin } = await import('../src/lib/db');
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(person(42) as any)).toBe(false);
    expect(isAdmin(person(583231) as any)).toBe(true);
    vi.stubEnv('ADMIN_GITHUB_IDS', '');
    vi.resetModules();
    const empty = await import('../src/lib/db');
    expect(empty.isAdmin(person(583231) as any)).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe('organizer pages are private', () => {
  it('recognises every organizer path and nothing else', () => {
    for (const p of ['/admin', '/admin/', '/admin/anything', '/api/admin/moderate', '/api/admin/subscribers.csv']) expect(isAdminPath(p)).toBe(true);
    for (const p of ['/', '/administer', '/api/administer', '/about', '/api/pledge', '/ideas/admin']) expect(isAdminPath(p)).toBe(false);
  });
  it('are never cached and never indexed', () => {
    expect(ADMIN_HEADERS['cache-control']).toBe('private, no-store');
    expect(ADMIN_HEADERS['x-robots-tag']).toContain('noindex');
    const middleware = readFileSync('src/middleware.ts', 'utf8');
    expect(middleware).toMatch(/if \(isAdminPath\(context\.url\.pathname\)\) \{\s*for \(const \[name, value\] of Object\.entries\(ADMIN_HEADERS\)\) response\.headers\.set\(name, value\);/);
    expect(readFileSync('src/pages/admin.astro', 'utf8')).toMatch(/<Base title="Admin" noindex>/);
    for (const page of ['visitors', 'people', 'manage']) expect(readFileSync(`src/pages/admin/${page}.astro`, 'utf8')).toMatch(/<Base title="Admin: [a-z ]+" noindex>/);
    for (const p of ['/admin/visitors', '/admin/people', '/admin/manage', '/api/admin/people.csv']) expect(isAdminPath(p)).toBe(true);
  });
});

// Every organizer page and route must turn everyone else away before it does anything at all.
function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}
const adminPages = readdirSync('src/pages').filter((n) => n.startsWith('admin')).flatMap((n) => {
  const path = join('src/pages', n);
  return statSync(path).isDirectory() ? filesUnder(path) : [path];
});
const adminRoutes = filesUnder('src/pages/api/admin');

/** The lines of code in order, without blank lines and comments. */
const code = (source: string) => source.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//') && !l.startsWith('/*') && !l.startsWith('*'));

describe('every organizer page and route checks isAdmin first', () => {
  it('finds the files it is meant to guard', () => {
    expect(adminPages).toContain('src/pages/admin.astro');
    for (const page of ['visitors', 'people', 'manage']) expect(adminPages).toContain(`src/pages/admin/${page}.astro`);
    expect(adminRoutes).toContain('src/pages/api/admin/people.csv.ts');
    expect(adminRoutes.length).toBeGreaterThanOrEqual(6);
  });
  it.each(adminPages)('%s', (file) => {
    const source = readFileSync(file, 'utf8');
    const frontmatter = source.split('---')[1] ?? '';
    const statements = code(frontmatter).filter((l) => !l.startsWith('import '));
    expect(statements[0]).toBe('if (!isAdmin(Astro.locals.person)) return new Response(null, { status: 404 });');
  });
  it.each(adminRoutes)('%s', (file) => {
    const lines = code(readFileSync(file, 'utf8'));
    const handlers = lines.map((l, i) => [l, i] as const).filter(([l]) => /^export (const|async function|function) (GET|POST|PUT|PATCH|DELETE|ALL)\b/.test(l));
    expect(handlers.length).toBeGreaterThan(0);
    for (const [, i] of handlers) {
      expect(lines[i + 1]).toBe('if (!isAdmin(locals.person)) return new Response(null, { status: 404 });');
    }
    // Nothing runs when the file is loaded except imports and constants.
    expect(lines.some((l) => /^(await|adminClient\(|db\b)/.test(l))).toBe(false);
  });
});

describe('the admin link', () => {
  const header = readFileSync('src/components/SiteHeader.astro', 'utf8');
  it('is only ever built for an organizer, so it is absent from the page for everyone else', () => {
    expect(header).toContain("const admin = isAdmin(person) ? [{ href: '/admin', label: 'Admin', on: here === '/admin' }] : [];");
    // The only mention of the admin address in the header is that one line, used by both menus.
    expect(header.match(/\/admin/g)?.length).toBe(2);
    expect(header).toContain('{[...links, ...admin].map(');
    expect(header).toContain('{[...links, ...more, ...admin].map(');
  });
  it('is drawn between the organizer\'s pages by a component only those pages use', () => {
    const users = [...filesUnder('src/components'), ...filesUnder('src/layouts'), ...filesUnder('src/pages')]
      .filter((f) => f.endsWith('.astro') && /AdminNav|adminNav/.test(readFileSync(f, 'utf8')) && f !== 'src/components/AdminNav.astro');
    expect(users.sort()).toEqual([...adminPages].sort());
  });
  it('appears in no other component, layout or public page', () => {
    const others = [...filesUnder('src/components'), ...filesUnder('src/layouts'), ...filesUnder('src/pages')]
      .filter((f) => f.endsWith('.astro') && f !== 'src/components/SiteHeader.astro' && !adminPages.includes(f));
    for (const f of others) expect(readFileSync(f, 'utf8'), f).not.toMatch(/href=["'{`]\/admin/);
  });
});

describe('the email list export', () => {
  it('is refused for everyone but the organizer, and carries each address\'s unsubscribe link', async () => {
    vi.resetModules();
    const allowed = { value: false };
    vi.doMock('../src/lib/db', () => ({
      isAdmin: () => allowed.value,
      listSubscribers: async () => [
        { email: 'ada@example.com', source: 'form', country: 'GB', subscribed_at: '2026-11-11T10:00:00Z', unsubscribed_at: null, token: '3f1c2b9a-0d4e-4c1a-9b7e-2a6d5e4f3c21' },
      ],
    }));
    const { GET } = await import('../src/pages/api/admin/subscribers.csv');
    const refused = await GET({ locals: { person: null } } as any);
    expect(refused.status).toBe(404);
    expect(await refused.text()).toBe('');
    allowed.value = true;
    const res = await GET({ locals: { person: {} } } as any);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const csv = await res.text();
    expect(csv.split('\r\n')[0]).toBe('"email","status","joined_by","country","subscribed_at","unsubscribed_at","unsubscribe_link"');
    expect(csv).toContain('"https://www.antipaywall.org/unsubscribe?t=3f1c2b9a-0d4e-4c1a-9b7e-2a6d5e4f3c21"');
    vi.doUnmock('../src/lib/db');
  });
});

describe('the people export', () => {
  it('is refused for everyone but the organizer, and is never cached', async () => {
    vi.resetModules();
    const allowed = { value: false };
    const getPeople = vi.fn(async () => ({ people: [], contacts: [{ email: 'ada@example.com', last_at: '2026-11-12T10:00:00Z', list: { source: 'form', country: 'GB', subscribed_at: '2026-11-12T10:00:00Z', unsubscribed_at: null }, inquiries: [], events: [] }], journeys: [] }));
    vi.doMock('../src/lib/db', () => ({ isAdmin: () => allowed.value, getPeople }));
    const { GET } = await import('../src/pages/api/admin/people.csv');
    const url = new URL('https://www.antipaywall.org/api/admin/people.csv');
    const refused = await GET({ locals: { person: null }, url } as any);
    expect(refused.status).toBe(404);
    expect(await refused.text()).toBe('');
    expect(getPeople).not.toHaveBeenCalled();
    allowed.value = true;
    const res = await GET({ locals: { person: {} }, url } as any);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('content-type')).toContain('text/csv');
    const csv = await res.text();
    expect(csv.split('\r\n')[0]).toContain('"who","type","profile","emails"');
    expect(csv).toContain('"ada@example.com"');
    vi.doUnmock('../src/lib/db');
  });
});
