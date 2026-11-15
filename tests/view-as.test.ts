import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseViewAs, seenAs, VIEW_COOKIE } from '../src/lib/viewAs';

describe('view as', () => {
  const me = { handle: 'ada', is_builder: false, verified: false, github_id: 7 };
  it('knows two kinds of account and nothing else', () => {
    expect(parseViewAs('member')).toBe('member');
    expect(parseViewAs('builder')).toBe('builder');
    for (const v of ['organizer', 'admin', '', null, undefined, 1]) expect(parseViewAs(v)).toBeNull();
  });
  it('changes only how the account type is drawn, never who the person is', () => {
    expect(seenAs(me, 'builder')).toEqual({ ...me, is_builder: true, verified: true });
    expect(seenAs({ ...me, is_builder: true, verified: true }, 'member')).toMatchObject({ is_builder: false, github_id: 7, handle: 'ada' });
    expect(seenAs(me, null)).toBe(me);
  });
  it('is honoured for the organizer only: for anyone else the cookie means nothing', () => {
    const middleware = readFileSync('src/middleware.ts', 'utf8');
    expect(middleware).toContain('context.locals.viewAs = null;');
    expect(middleware).toContain('if (isAdmin(context.locals.person)) context.locals.viewAs = parseViewAs(context.cookies.get(VIEW_COOKIE)?.value);');
    // It is set in that one place and nowhere else in the site.
    expect(middleware.match(/locals\.viewAs =/g)?.length).toBe(2);
  });
  it('never decides what someone may do: no write route reads it', () => {
    for (const f of ['delete', 'email', 'profile', 'repos', 'username']) expect(readFileSync(`src/pages/api/account/${f}.ts`, 'utf8'), f).not.toMatch(/viewAs|seenAs/);
    expect(readFileSync('src/lib/db.ts', 'utf8')).not.toMatch(/viewAs|seenAs/);
  });
  it('hides the way into the organizer\'s pages while looking as someone else', () => {
    expect(readFileSync('src/components/AccountNav.astro', 'utf8')).toContain("const organizer = isAdmin(real) && !view ? [{ href: '/admin', label: 'Organizer pages' }] : [];");
  });
});

describe('the view-as switch', () => {
  const state = { admin: false };
  beforeEach(() => {
    vi.resetModules();
    state.admin = false;
    vi.doMock('../src/lib/db', () => ({ isAdmin: () => state.admin }));
    vi.doMock('../src/lib/supabase', () => ({ needsSecure: () => true }));
  });
  async function post(fields: Record<string, string>) {
    const { POST } = await import('../src/pages/api/admin/view-as');
    const body = new FormData();
    for (const [k, v] of Object.entries(fields)) body.set(k, v);
    const set: [string, string][] = [];
    const deleted: string[] = [];
    const cookies = { set: (n: string, v: string) => set.push([n, v]), delete: (n: string) => deleted.push(n) };
    const redirect = (to: string, status: number) => new Response(null, { status, headers: { location: to } });
    const res = (await POST({ request: new Request('https://x.test/api/admin/view-as', { method: 'POST', body }), locals: { person: {} }, cookies, redirect } as any)) as Response;
    return { res, set, deleted };
  }
  it('does not exist for anyone but the organizer', async () => {
    const { res, set } = await post({ as: 'builder' });
    expect(res.status).toBe(404);
    expect(set).toEqual([]);
  });
  it('turns a view on, and off again, and only sends you to one of our own pages', async () => {
    state.admin = true;
    const on = await post({ as: 'builder', next: '/account/profile' });
    expect(on.set).toEqual([[VIEW_COOKIE, 'builder']]);
    expect(on.res.headers.get('location')).toBe('/account/profile');
    const off = await post({ as: '', next: '//evil.example' });
    expect(off.deleted).toEqual([VIEW_COOKIE]);
    expect(off.res.headers.get('location')).toBe('/account');
    expect((await post({ as: 'organizer' })).set).toEqual([]);
  });
});
