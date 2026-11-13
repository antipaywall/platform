import { describe, expect, it } from 'vitest';
import { signInEmail } from '../src/lib/email';
import { requestEmailLink, signInLink } from '../src/lib/emailSignIn';

describe('signInEmail', () => {
  const e = signInEmail('e@ethanplus.ai', 'https://www.antipaywall.org/auth/callback?x=1');
  it('carries the link and says it works once, for an hour', () => {
    expect(e.to).toBe('e@ethanplus.ai');
    expect(e.subject).toBe('Your Antipaywall sign-in link');
    expect(e.text).toContain('https://www.antipaywall.org/auth/callback?x=1');
    expect(e.text).toMatch(/one hour/);
    expect(e.text).toMatch(/once/);
  });
  it('says signing in adds nobody to a list', () => {
    expect(e.text).toMatch(/not add you to any email list/);
  });
});

describe('signInLink', () => {
  it('lands on our callback with the token, never on Supabase', () => {
    const link = signInLink('https://www.antipaywall.org', 'abc123', '/ideas/new');
    expect(link).toBe('https://www.antipaywall.org/auth/callback?provider=email&token_hash=abc123&type=magiclink&next=%2Fideas%2Fnew');
  });
});

describe('requestEmailLink', () => {
  const okDeps = () => {
    const sent: string[] = [];
    return {
      sent,
      deps: {
        allowed: async () => true,
        generate: async (email: string) => ({ hashedToken: `t-${email}` }),
        send: async (to: string, link: string) => { sent.push(`${to} ${link}`); return true; },
      },
    };
  };
  it('refuses an address that does not look right', async () => {
    const { deps } = okDeps();
    expect(await requestEmailLink({ email: 'not-an-email', next: '/', origin: 'https://x' }, deps)).toBe('bad_email');
  });
  it('sends one link to the address given', async () => {
    const { deps, sent } = okDeps();
    expect(await requestEmailLink({ email: 'E@EthanPlus.ai ', next: '/', origin: 'https://x' }, deps)).toBe('email_link_sent');
    expect(sent).toEqual(['e@ethanplus.ai https://x/auth/callback?provider=email&token_hash=t-e%40ethanplus.ai&type=magiclink&next=%2F']);
  });
  it('answers the same whether or not a link could be made, so nobody can test which addresses have accounts', async () => {
    const { deps } = okDeps();
    const failing = { ...deps, generate: async () => null };
    expect(await requestEmailLink({ email: 'someone@example.com', next: '/', origin: 'https://x' }, failing)).toBe('email_link_sent');
  });
  it('stops when the address or connection has asked too often', async () => {
    const { deps, sent } = okDeps();
    expect(await requestEmailLink({ email: 'e@ethanplus.ai', next: '/', origin: 'https://x' }, { ...deps, allowed: async () => false })).toBe('too_many');
    expect(sent).toEqual([]);
  });
});
