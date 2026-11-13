import { describe, expect, it, vi } from 'vitest';
import { visitorHash } from '../src/lib/analytics';
import { accountIdentity } from '../src/lib/identity';
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

describe('accountIdentity', () => {
  const github = { provider: 'github', id: 'x', identity_data: { provider_id: '583231', sub: '583231', email: 'octo@example.com' } };
  const gitlab = { provider: 'gitlab', id: 'y', identity_data: { provider_id: '1234', sub: '1234', email: 'tanuki@example.com' } };
  it('reads the id and email from the GitHub identity record', () => {
    expect(accountIdentity({ app_metadata: { provider: 'github' }, identities: [github] }, 'github')).toEqual({ provider: 'github', accountId: 583231, email: 'octo@example.com' });
  });
  it('reads the id and email from the GitLab identity record', () => {
    expect(accountIdentity({ app_metadata: { provider: 'gitlab', providers: ['gitlab'] }, identities: [gitlab] }, 'gitlab')).toEqual({ provider: 'gitlab', accountId: 1234, email: 'tanuki@example.com' });
  });
  it('reads the identity of the provider the sign-in used, not another one linked to the same session', () => {
    const user = { app_metadata: { provider: 'github', providers: ['github', 'gitlab'] }, identities: [github, gitlab] };
    expect(accountIdentity(user, 'gitlab')?.accountId).toBe(1234);
    expect(accountIdentity(user, 'github')?.accountId).toBe(583231);
  });
  it('refuses a session with no identity record from that provider', () => {
    expect(accountIdentity({ app_metadata: { provider: 'email' }, identities: [github] }, 'github')).toBeNull();
    expect(accountIdentity({ app_metadata: {}, identities: [github] }, 'github')).toBeNull();
    expect(accountIdentity({ app_metadata: { provider: 'github' }, identities: [{ provider: 'email', id: '1' }] }, 'github')).toBeNull();
    expect(accountIdentity({ app_metadata: { provider: 'github' }, identities: [] }, 'github')).toBeNull();
    expect(accountIdentity({ app_metadata: { provider: 'github' }, identities: null }, 'github')).toBeNull();
    expect(accountIdentity({ app_metadata: { provider: 'github', providers: ['github'] }, identities: [github, gitlab] }, 'gitlab')).toBeNull();
    expect(accountIdentity({ app_metadata: { provider: 'gitlab', providers: ['gitlab'] }, identities: [github] }, 'github')).toBeNull();
  });
  it('never reads profile data the signed-in user can edit', () => {
    const user = { app_metadata: { provider: 'email' }, user_metadata: { provider_id: '1', user_name: 'torvalds' }, identities: [] } as any;
    expect(accountIdentity(user, 'github')).toBeNull();
    expect(accountIdentity(user, 'gitlab')).toBeNull();
  });
  it('refuses an id that is not a positive whole number', () => {
    for (const provider_id of ['abc', '-1', '0', '1.5', '', '1e9']) {
      expect(accountIdentity({ app_metadata: { provider: 'github' }, identities: [{ provider: 'github', id: 'abc', identity_data: { provider_id } }] }, 'github')).toBeNull();
      expect(accountIdentity({ app_metadata: { providers: ['gitlab'] }, identities: [{ provider: 'gitlab', id: 'abc', identity_data: { provider_id } }] }, 'gitlab')).toBeNull();
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

describe('writes that come from outside a browser', () => {
  const self = 'https://www.antipaywall.org';
  it("accepts GitHub's events and agents' MCP calls, which carry no Origin and use no cookies", () => {
    expect(allowedRequest({ method: 'POST', origin: null, self, path: '/api/github/webhook' })).toBe(true);
    expect(allowedRequest({ method: 'POST', origin: null, self, path: '/mcp' })).toBe(true);
  });
  it('still refuses every other cross-site write', () => {
    expect(allowedRequest({ method: 'POST', origin: null, self, path: '/api/signal' })).toBe(false);
    expect(allowedRequest({ method: 'POST', origin: 'https://evil.example', self, path: '/mcp/other' })).toBe(false);
  });
});
