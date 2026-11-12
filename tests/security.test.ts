import { describe, expect, it, vi } from 'vitest';
import { visitorHash } from '../src/lib/analytics';
import { githubIdentity } from '../src/lib/identity';
import { allowedRequest, ONE_CLICK_PATH } from '../src/lib/origin';
import { rateKey, takeSlot } from '../src/lib/ratelimit';
import { needsSecure } from '../src/lib/supabase';

describe('rateKey', () => {
  const key = 'k'.repeat(40);
  const day = '2026-11-12';
  const ip = '203.0.113.77';
  it('depends on the address and the day only', () => {
    expect(rateKey(key, day, ip)).toBe(rateKey(key, day, ip));
    expect(rateKey(key, day, '203.0.113.78')).not.toBe(rateKey(key, day, ip));
    expect(rateKey(key, '2026-11-13', ip)).not.toBe(rateKey(key, day, ip));
    // There is no browser name to change: the function does not take one.
    expect(rateKey.length).toBe(3);
  });
  it('is unrelated to the page-view visitor code for the same address', () => {
    const limit = rateKey(key, day, ip);
    for (const ua of ['', 'Mozilla/5.0', 'rate-limit']) {
      const visitor = visitorHash(key, day, ip, ua);
      expect(limit.startsWith(visitor)).toBe(false);
      expect(visitor.startsWith(limit.slice(0, 16))).toBe(false);
    }
  });
  it('is 24 hex characters and does not contain the address', () => {
    expect(rateKey(key, day, ip)).toMatch(/^[0-9a-f]{24}$/);
  });
});

describe('takeSlot', () => {
  const db = (data: unknown, error: unknown = null) => ({ rpc: vi.fn(async () => ({ data, error })) }) as any;
  it('reports ok, limited, or an error, and never throws', async () => {
    expect(await takeSlot(db(true), 'subscribe', 'abc', 5)).toBe('ok');
    expect(await takeSlot(db(false), 'subscribe', 'abc', 5)).toBe('limited');
    expect(await takeSlot(db(null, { message: 'down' }), 'subscribe', 'abc', 5)).toBe('error');
    expect(await takeSlot(db('yes'), 'subscribe', 'abc', 5)).toBe('error');
  });
});

describe('allowedRequest', () => {
  const self = 'https://www.antipaywall.org';
  const post = (origin: string | null, path = '/api/pledge') => allowedRequest({ method: 'POST', origin, self, path });
  it('lets reads through from anywhere', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS', 'get']) expect(allowedRequest({ method, origin: 'https://evil.example', self, path: '/' })).toBe(true);
  });
  it('accepts a write only from our own origin', () => {
    expect(post(self)).toBe(true);
    expect(post('https://evil.example')).toBe(false);
    expect(post('https://antipaywall.org')).toBe(false);
    expect(post('null')).toBe(false);
    expect(post(null)).toBe(false);
  });
  it('applies to every writing method', () => {
    for (const method of ['PUT', 'PATCH', 'DELETE']) expect(allowedRequest({ method, origin: null, self, path: '/api/pledge' })).toBe(false);
  });
  it('makes one exception, for a mail app pressing its unsubscribe button', () => {
    expect(post(null, ONE_CLICK_PATH)).toBe(true);
    expect(post('https://mail.example', ONE_CLICK_PATH)).toBe(true);
    expect(post(null, ONE_CLICK_PATH + '/x')).toBe(false);
    expect(post(null, '/api/unsubscribe')).toBe(false);
    expect(post(null, '/api/resubscribe')).toBe(false);
  });
});

describe('githubIdentity', () => {
  const github = { provider: 'github', id: 'x', identity_data: { provider_id: '583231', sub: '583231', email: 'octo@example.com' } };
  it('reads the id and email from the GitHub identity record', () => {
    expect(githubIdentity({ app_metadata: { provider: 'github' }, identities: [github] })).toEqual({ githubId: 583231, email: 'octo@example.com' });
  });
  it('refuses a session that came from any other kind of sign-in', () => {
    expect(githubIdentity({ app_metadata: { provider: 'email' }, identities: [github] })).toBeNull();
    expect(githubIdentity({ app_metadata: {}, identities: [github] })).toBeNull();
    expect(githubIdentity({ app_metadata: { provider: 'github' }, identities: [{ provider: 'email', id: '1' }] })).toBeNull();
    expect(githubIdentity({ app_metadata: { provider: 'github' }, identities: [] })).toBeNull();
    expect(githubIdentity({ app_metadata: { provider: 'github' }, identities: null })).toBeNull();
  });
  it('never reads profile data the signed-in user can edit', () => {
    const user = { app_metadata: { provider: 'email' }, user_metadata: { provider_id: '1', user_name: 'torvalds' }, identities: [] } as any;
    expect(githubIdentity(user)).toBeNull();
  });
  it('refuses an id that is not a positive whole number', () => {
    for (const provider_id of ['abc', '-1', '0', '1.5', '', '1e9']) {
      expect(githubIdentity({ app_metadata: { provider: 'github' }, identities: [{ provider: 'github', id: 'abc', identity_data: { provider_id } }] })).toBeNull();
    }
  });
});

describe('needsSecure: session cookies', () => {
  it('are https-only everywhere except plain http on this machine', () => {
    expect(needsSecure('https://www.antipaywall.org/auth/callback')).toBe(true);
    expect(needsSecure('https://platform-git-branch.vercel.app/')).toBe(true);
    expect(needsSecure('http://example.com/')).toBe(true);
    expect(needsSecure('http://localhost:4610/')).toBe(false);
    expect(needsSecure('http://127.0.0.1:4610/')).toBe(false);
  });
  it('are set so page scripts cannot read them', async () => {
    const source = (await import('node:fs')).readFileSync('src/lib/supabase.ts', 'utf8');
    expect(source).toMatch(/cookies\.set\(name, value, \{ \.\.\.options, path: '\/', httpOnly: true, sameSite: 'lax', secure: needsSecure\(request\.url\) \}\)/);
  });
});
