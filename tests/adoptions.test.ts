import { describe, expect, it } from 'vitest';
import { accountLine, verifiedGithubLogin } from '../src/lib/accounts';
import { ADOPTION_TERMS, canOffer, parseTerms } from '../src/lib/adoptions';

describe('who can hand something off', () => {
  it('lets the owner of a repo offer their project', () => {
    expect(canOffer({ kind: 'project', fullName: 'Ethan/brand-kit' }, { githubLogin: 'ethan', personId: 'p1' })).toBe(true);
    expect(canOffer({ kind: 'project', fullName: 'someone/brand-kit' }, { githubLogin: 'ethan', personId: 'p1' })).toBe(false);
  });
  it('lets the starter or a builder on a gap offer it', () => {
    expect(canOffer({ kind: 'gap', startedBy: 'ethan', claimers: [] }, { githubLogin: 'Ethan', personId: 'p1' })).toBe(true);
    expect(canOffer({ kind: 'gap', startedBy: 'maya', claimers: ['p1'] }, { githubLogin: 'ethan', personId: 'p1' })).toBe(true);
    expect(canOffer({ kind: 'gap', startedBy: 'maya', claimers: [] }, { githubLogin: 'ethan', personId: 'p1' })).toBe(false);
  });
});

describe('terms', () => {
  it('has the four terms, in plain words', () => {
    expect(ADOPTION_TERMS.map((t) => t.key)).toEqual(['open_source', 'credit', 'advise', 'ask_first']);
  });
  it('keeps only known terms, once each', () => {
    const f = new FormData();
    for (const t of ['credit', 'credit', 'open_source', 'pay_me']) f.append('terms', t);
    expect(parseTerms(f)).toEqual(['open_source', 'credit']);
  });
});

describe('review fixes: a gap is offered by its poster, matched by account', () => {
  it('lets the person who posted it offer it, whatever their username is now', () => {
    expect(canOffer({ kind: 'gap', authorId: 'p1', startedBy: 'old-name', claimers: [] }, { githubLogin: 'new-name', personId: 'p1' })).toBe(true);
    expect(canOffer({ kind: 'gap', authorId: 'p1', startedBy: 'sam', claimers: [] }, { githubLogin: 'sam', personId: 'p2' })).toBe(false);
  });
});

describe('security fix: a project is offered by its verified GitHub owner only', () => {
  it('never lets a username chosen here stand in for a GitHub login', () => {
    // A GitLab account whose username matches a GitHub owner, with no linked GitHub account.
    const gitlab = { provider: 'gitlab', handle: 'ethan', github_login: null };
    expect(canOffer({ kind: 'project', fullName: 'ethan/brand-kit' }, { githubLogin: verifiedGithubLogin(gitlab), personId: 'p9' })).toBe(false);
    expect(canOffer({ kind: 'gap', startedBy: 'ethan', claimers: [] }, { githubLogin: verifiedGithubLogin(gitlab), personId: 'p9' })).toBe(false);
  });
  it('counts a GitLab account through the GitHub account GitHub confirmed is linked', () => {
    const linked = { provider: 'gitlab', handle: 'e-lab', github_login: 'Ethan' };
    expect(canOffer({ kind: 'project', fullName: 'ethan/brand-kit' }, { githubLogin: verifiedGithubLogin(linked), personId: 'p9' })).toBe(true);
  });
  it('reads a GitHub account by its handle, but not one marked stale', () => {
    expect(verifiedGithubLogin({ provider: 'github', handle: 'ethan' })).toBe('ethan');
    expect(verifiedGithubLogin({ provider: null, handle: 'ethan' })).toBe('ethan');
    expect(verifiedGithubLogin({ provider: 'github', handle: 'ethan~1a2b3c4d' })).toBeNull();
  });
});

describe('security fix: organizer emails name the site someone signed in with', () => {
  it('labels a GitLab account as GitLab, with its profile link', () => {
    expect(accountLine({ provider: 'gitlab', handle: 'maya' })).toEqual(['GitLab', '@maya (https://gitlab.com/maya)']);
    expect(accountLine({ provider: 'github', handle: 'sam' })).toEqual(['GitHub', '@sam (https://github.com/sam)']);
  });
});
