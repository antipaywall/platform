import { describe, expect, it } from 'vitest';
import { httpsLink, parseIdea, parsePledge, parseProfile, parseXHandle, slugify } from '../src/lib/forms';
import { publicPledge } from '../src/lib/db';

describe('parsePledge', () => {
  const p = (amount: string, displayName = 'Ada') => parsePledge({ email: 'ada@example.com', amount, displayName, githubHandle: 'ada' });
  it.each(['abc', '0', '-5', '10.999', '1e9', '', '0.50', '99999999'])('rejects %s', (a) => {
    expect(p(a).ok).toBe(false);
  });
  it('accepts dollars, cents, a leading $ and commas', () => {
    expect(p('25')).toMatchObject({ ok: true, amountCents: 2500, status: 'listed' });
    expect(p('$1,250.50')).toMatchObject({ ok: true, amountCents: 125050 });
  });
  it('holds anything over $1,000 for a manual check', () => {
    expect(p('1000')).toMatchObject({ status: 'listed' });
    expect(p('1000.01')).toMatchObject({ status: 'held' });
  });
  it('reports problems as message codes, never free text', () => {
    expect(p('abc')).toEqual({ ok: false, error: 'bad_amount' });
    expect(p('5', '')).toEqual({ ok: false, error: 'bad_name' });
  });
  it('requires a display name of 1 to 60 characters and keeps markup as plain text', () => {
    expect(p('5', '   ').ok).toBe(false);
    expect(p('5', 'x'.repeat(61)).ok).toBe(false);
    expect(p('5', '  <script>x</script>  ')).toMatchObject({ displayName: '<script>x</script>' });
  });
});

describe('parseIdea', () => {
  it('requires a 3 to 80 character title and builds a slug', () => {
    expect(parseIdea({ title: 'ab' }).ok).toBe(false);
    expect(parseIdea({ title: 'x'.repeat(81) }).ok).toBe(false);
    expect(parseIdea({ title: '  Brand design   skill ' })).toMatchObject({ ok: true, title: 'Brand design skill', slug: 'brand-design-skill' });
    expect(parseIdea({ title: '!!!' }).ok).toBe(false);
  });
  it('limits the pitch and the missing note', () => {
    expect(parseIdea({ title: 'Good idea', pitch: 'x'.repeat(281) }).ok).toBe(false);
    expect(parseIdea({ title: 'Good idea', missing: 'x'.repeat(601) }).ok).toBe(false);
  });
  it('ignores any list of existing projects sent with the form', () => {
    const got = parseIdea({ title: 'Good idea', repos: [{ fullName: 'evil/malware', stars: 99000 }] } as any);
    expect(got.ok && 'repos' in got).toBe(false);
  });
});

describe('parseProfile', () => {
  it('accepts blanks, strips the @, and refuses odd handles', () => {
    expect(parseProfile({})).toMatchObject({ ok: true, xHandle: null, siteUrl: null });
    expect(parseProfile({ xHandle: '@ethan_' })).toMatchObject({ xHandle: 'ethan_' });
    expect(parseProfile({ xHandle: 'has space' }).ok).toBe(false);
  });
  it('only allows https sites of at most 200 characters', () => {
    expect(parseProfile({ siteUrl: 'https://example.com' })).toMatchObject({ ok: true, siteUrl: 'https://example.com/' });
    expect(parseProfile({ siteUrl: 'http://example.com' })).toEqual({ ok: false, error: 'bad_site' });
    expect(parseProfile({ siteUrl: 'javascript:alert(1)' }).ok).toBe(false);
    expect(parseProfile({ siteUrl: 'example' }).ok).toBe(false);
    expect(parseProfile({ siteUrl: 'https://example.com/' + 'a'.repeat(200) }).ok).toBe(false);
  });
  it('accepts a pasted X profile link and keeps only the username', () => {
    expect(parseProfile({ xHandle: 'https://x.com/ethan_' })).toMatchObject({ xHandle: 'ethan_' });
  });
});

describe('slugify', () => {
  it('lowercases, joins with dashes and trims', () => {
    expect(slugify('  A Free Logo & Brand-Kit Maker!  ')).toBe('a-free-logo-brand-kit-maker');
  });
});

describe('parseXHandle', () => {
  it('accepts a bare name, an @name and a pasted profile link', () => {
    expect(parseXHandle('ethanplusai')).toEqual({ ok: true, handle: 'ethanplusai' });
    expect(parseXHandle(' @Some_One1 ')).toEqual({ ok: true, handle: 'Some_One1' });
    expect(parseXHandle('https://x.com/some_one?s=21')).toEqual({ ok: true, handle: 'some_one' });
    expect(parseXHandle('twitter.com/@some_one/')).toEqual({ ok: true, handle: 'some_one' });
  });
  it('treats blank as none', () => {
    expect(parseXHandle('')).toEqual({ ok: true, handle: null });
    expect(parseXHandle(undefined)).toEqual({ ok: true, handle: null });
  });
  it.each(['has space', 'way_too_long_for_x_names', 'a/b', 'https://evil.example/x.com/name', 'name"onerror=', '../etc', 'https://x.com/a/status/1'])('refuses %s', (v) => {
    expect(parseXHandle(v)).toEqual({ ok: false, error: 'bad_x' });
  });
});

describe('parsePledge: who is pledging', () => {
  it('defaults to an individual and ignores a website from one', () => {
    expect(parsePledge({ email: 'ada@example.com', amount: '25', displayName: 'Ada', companyUrl: 'https://example.com', githubHandle: 'ada' })).toMatchObject({ kind: 'individual', companyUrl: null, xHandle: null, status: 'listed' });
  });
  it('holds every company pledge for a manual check, whatever the amount', () => {
    expect(parsePledge({ email: 'ada@example.com', amount: '5', displayName: 'Acme', kind: 'company', githubHandle: 'ada' })).toMatchObject({ kind: 'company', status: 'held' });
  });
  it('keeps the X username and an https website for a company', () => {
    expect(parsePledge({ email: 'ada@example.com', amount: '500', displayName: 'Acme', kind: 'company', companyUrl: 'https://acme.example/', xHandle: '@acme', githubHandle: 'ada' })).toMatchObject({ companyUrl: 'https://acme.example/', xHandle: 'acme' });
  });
  it('refuses a website that is not https, and a bad X username', () => {
    expect(parsePledge({ email: 'ada@example.com', amount: '5', displayName: 'Acme', kind: 'company', companyUrl: 'http://acme.example', githubHandle: 'ada' })).toEqual({ ok: false, error: 'bad_site' });
    expect(parsePledge({ email: 'ada@example.com', amount: '5', displayName: 'Acme', kind: 'company', companyUrl: 'javascript:alert(1)', githubHandle: 'ada' })).toEqual({ ok: false, error: 'bad_site' });
    expect(parsePledge({ email: 'ada@example.com', amount: '5', displayName: 'Ada', xHandle: 'not a name', githubHandle: 'ada' })).toEqual({ ok: false, error: 'bad_x' });
  });
  it('treats any unknown kind as an individual', () => {
    expect(parsePledge({ email: 'ada@example.com', amount: '5', displayName: 'Ada', kind: 'admin', githubHandle: 'ada' })).toMatchObject({ kind: 'individual' });
  });
});

describe('parsePledge: what waits for a person to check it', () => {
  const base = { amount: '25', displayName: 'ada', githubHandle: 'ada', email: 'ada@example.com' };
  it('lists a small pledge from an individual under their own GitHub handle straight away', () => {
    expect(parsePledge(base)).toMatchObject({ status: 'listed', holdReasons: [] });
  });
  it('compares the name with the handle without regard to case or a leading @', () => {
    expect(parsePledge({ ...base, displayName: '@Ada' })).toMatchObject({ status: 'listed' });
    expect(parsePledge({ ...base, displayName: 'ADA' })).toMatchObject({ status: 'listed' });
  });
  it('holds a pledge shown under any other name', () => {
    expect(parsePledge({ ...base, displayName: 'Stripe' })).toMatchObject({ status: 'held', holdReasons: ['name'] });
    expect(parsePledge({ ...base, displayName: 'ada lovelace' })).toMatchObject({ status: 'held', holdReasons: ['name'] });
  });
  it('holds a pledge that names an X account', () => {
    expect(parsePledge({ ...base, xHandle: '@elonmusk' })).toMatchObject({ status: 'held', holdReasons: ['x_account'] });
  });
  it('gives every reason that applies', () => {
    expect(parsePledge({ email: 'ada@example.com', amount: '5000', displayName: 'Acme', kind: 'company', xHandle: 'acme', githubHandle: 'ada' })).toMatchObject({
      status: 'held', holdReasons: ['company', 'amount', 'x_account', 'name'],
    });
  });
});

describe('httpsLink', () => {
  it('treats blank as none', () => {
    expect(httpsLink('')).toBeNull();
    expect(httpsLink(undefined)).toBeNull();
  });
  it.each(['http://example.com', 'ftp://example.com', 'javascript:alert(1)', 'data:text/html,x', '//example.com', 'https://localhost', 'example.com', 'https://example.com/' + 'a'.repeat(190)])('refuses %s', (v) => {
    expect(httpsLink(v)).toBe(false);
  });
  it('accepts an https address with a real host', () => {
    expect(httpsLink(' https://example.com/logo.png ')).toBe('https://example.com/logo.png');
  });
});

describe('parsePledge: reaching the pledger, and staying anonymous', () => {
  const base = { amount: '25', displayName: 'ada', githubHandle: 'ada', email: 'Ada@Example.com' };
  it('requires an email address and stores it lowercased', () => {
    expect(parsePledge(base)).toMatchObject({ email: 'ada@example.com', anonymous: false });
    expect(parsePledge({ ...base, email: '' })).toEqual({ ok: false, error: 'need_email' });
    expect(parsePledge({ ...base, email: undefined })).toEqual({ ok: false, error: 'need_email' });
    expect(parsePledge({ ...base, email: 'not an address' })).toEqual({ ok: false, error: 'need_email' });
  });
  it('shows an anonymous pledge as "Anonymous" whatever name was typed, and needs no name', () => {
    expect(parsePledge({ ...base, anonymous: 'on', displayName: 'Stripe' })).toMatchObject({ displayName: 'Anonymous', anonymous: true, status: 'listed', holdReasons: [] });
    expect(parsePledge({ ...base, anonymous: 'on', displayName: '' })).toMatchObject({ displayName: 'Anonymous', anonymous: true });
  });
  it('does not hold an anonymous pledge for an X account nobody will see, but still holds a company or a large amount', () => {
    expect(parsePledge({ ...base, anonymous: 'on', xHandle: '@ada' })).toMatchObject({ status: 'listed', xHandle: 'ada' });
    expect(parsePledge({ ...base, anonymous: 'on', kind: 'company' })).toMatchObject({ status: 'held', holdReasons: ['company'] });
    expect(parsePledge({ ...base, anonymous: 'on', amount: '100000' })).toMatchObject({ status: 'held' });
  });
  it('treats an unticked box as not anonymous', () => {
    expect(parsePledge({ ...base, anonymous: null })).toMatchObject({ anonymous: false });
  });
});

describe('publicPledge', () => {
  const row = { id: '1', display_name: 'Anonymous', handle: 'ada', amount_cents: 500, status: 'listed', created_at: '', kind: 'company' as const, company_url: 'https://acme.example/', x_handle: 'ada', anonymous: true, email: 'ada@example.com' };
  it('blanks everything that identifies an anonymous pledger and never passes an email on', () => {
    expect(publicPledge(row)).toEqual({ id: '1', display_name: 'Anonymous', handle: '', amount_cents: 500, status: 'listed', created_at: '', kind: 'company', company_url: null, x_handle: null, anonymous: true });
    expect(publicPledge({ ...row, anonymous: false })).not.toHaveProperty('email');
    expect(publicPledge({ ...row, anonymous: false })).toMatchObject({ handle: 'ada', x_handle: 'ada' });
  });
});
