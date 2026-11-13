import { createHmac, generateKeyPairSync, createPublicKey, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { appJwt, verifyWebhook } from '../src/lib/githubApp';
import { ideaPath, parseIdeaFile, renderIdeaFile, type IdeaFile } from '../src/lib/ideaFile';

const idea: IdeaFile = {
  slug: 'static-site-reviews-widget',
  title: 'All-in-one reviews widget for static sites',
  status: 'wanted',
  startedBy: 'ethanplusai',
  replaces: ['elfsight'],
  like: ['https://www.elfsight.com/google-reviews-widget/'],
  mergedInto: null,
  created: '2026-11-13',
  sections: {
    problem: 'Reviews live on Google and Yelp, not on my site.',
    build: 'One widget that pulls them in.',
    missing: 'Works with no server.',
    questions: 'How do reviews refresh without a server?',
  },
};

describe('idea files', () => {
  it('round-trips through Markdown with front matter', () => {
    const text = renderIdeaFile(idea);
    expect(text.startsWith('---\n')).toBe(true);
    expect(text).toContain('## The problem');
    expect(parseIdeaFile(text, ideaPath(idea.slug))).toEqual(idea);
  });
  it('lives at ideas/<slug>.md', () => {
    expect(ideaPath('brand-kit')).toBe('ideas/brand-kit.md');
  });
  it('reads a file a developer edited by hand, keeping unknown sections out', () => {
    const text = `---\ntitle: Brand kit\nstatus: building\n---\n\n## The problem\nLogos look generic.\n\n## Something else\nIgnored.\n`;
    const parsed = parseIdeaFile(text, 'ideas/brand-kit.md');
    expect(parsed).toMatchObject({ slug: 'brand-kit', title: 'Brand kit', status: 'building', startedBy: null, sections: { problem: 'Logos look generic.' } });
  });
  it('refuses a file with no title or a bad status', () => {
    expect(() => parseIdeaFile('---\nstatus: wanted\n---\n', 'ideas/x.md')).toThrow(/title/);
    expect(() => parseIdeaFile('---\ntitle: X\nstatus: done\n---\n', 'ideas/x.md')).toThrow(/status/);
  });
});

describe('the GitHub App token', () => {
  it('is an RS256 JWT for the App, valid under ten minutes', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
    const now = new Date('2026-11-13T00:00:00Z');
    const jwt = appJwt('12345', privateKey, now);
    const [h, p, sig] = jwt.split('.');
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' });
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
    expect(claims.iss).toBe('12345');
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(600);
    expect(verify('RSA-SHA256', Buffer.from(`${h}.${p}`), createPublicKey(privateKey), Buffer.from(sig, 'base64url'))).toBe(true);
  });
});

describe('verifyWebhook', () => {
  const body = '{"ref":"refs/heads/main"}';
  const secret = 'shh';
  const good = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
  it('accepts GitHub signature', () => {
    expect(verifyWebhook(body, good, secret)).toBe(true);
  });
  it('refuses a wrong, missing or malformed signature', () => {
    expect(verifyWebhook(body, good.replace(/.$/, '0'), secret)).toBe(false);
    expect(verifyWebhook(body, null, secret)).toBe(false);
    expect(verifyWebhook(body, 'sha1=abc', secret)).toBe(false);
    expect(verifyWebhook(body, good, '')).toBe(false);
  });
});

import { canDecide, changedIdeaPaths, ideaFromRow, suggestionBranch } from '../src/lib/suggestions';

describe('suggestions', () => {
  it('lets the starter decide, or a maintainer when Antipaywall posted the idea', () => {
    expect(canDecide({ startedBy: 'maya' }, 'Maya', ['ethanplusai'])).toBe(true);
    expect(canDecide({ startedBy: 'maya' }, 'sam', ['ethanplusai'])).toBe(false);
    expect(canDecide({ startedBy: null }, 'ethanplusai', ['ethanplusai'])).toBe(true);
    expect(canDecide({ startedBy: null }, 'sam', ['ethanplusai'])).toBe(false);
    expect(canDecide({ startedBy: 'maya' }, 'ethanplusai', ['ethanplusai'])).toBe(true);
  });
  it('gives two suggestions to the same idea their own branches', () => {
    const now = new Date('2026-11-13T00:00:00Z');
    const a = suggestionBranch('brand-kit', 'sam', now);
    const b = suggestionBranch('brand-kit', 'sam', new Date(now.getTime() + 1000));
    expect(a).not.toBe(b);
    expect(a.startsWith('suggest/brand-kit/sam-')).toBe(true);
  });
  it('reads which idea files a push to main changed, and nothing from other repos or branches', () => {
    const push = { ref: 'refs/heads/main', repository: { full_name: 'antipaywall/ideas' }, commits: [{ added: ['ideas/a.md'], modified: ['ideas/b.md', 'README.md'], removed: ['ideas/c.md'] }] };
    expect(changedIdeaPaths(push)).toEqual({ changed: ['ideas/a.md', 'ideas/b.md'], removed: ['ideas/c.md'] });
    expect(changedIdeaPaths({ ...push, ref: 'refs/heads/other' })).toEqual({ changed: [], removed: [] });
    expect(changedIdeaPaths({ ...push, repository: { full_name: 'someone/ideas' } })).toEqual({ changed: [], removed: [] });
  });
  it('turns a database row into an idea file', () => {
    const f = ideaFromRow({ slug: 'x', title: 'X', pitch: 'p', problem: 'pr', build: 'b', strong: '', missing: 'm', build_status: 'wanted', merged_into_slug: null, created_at: '2026-11-12T10:00:00Z' }, 'maya', ['calendly']);
    expect(f).toMatchObject({ slug: 'x', title: 'X', pitch: 'p', startedBy: 'maya', replaces: ['calendly'], created: '2026-11-12', sections: { problem: 'pr', build: 'b', missing: 'm' } });
  });
});
