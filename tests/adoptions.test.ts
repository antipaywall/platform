import { describe, expect, it } from 'vitest';
import { accountLine, verifiedGithubLogin } from '../src/lib/accounts';
import { ADOPTION_TERMS, canOffer, parseTerms } from '../src/lib/adoptions';
import { provenGithubLogin } from '../src/lib/usernames';

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

describe('security fix: handoffs ask GitHub who owns the name now', () => {
  const github = (logins: Record<number, string>) =>
    (async (url: string) => {
      const id = Number(String(url).split('/').pop());
      return logins[id] ? new Response(JSON.stringify({ id, login: logins[id] })) : new Response('', { status: 404 });
    }) as unknown as typeof fetch;
  const db = (identities: unknown[]) => ({ auth: { admin: { getUserById: async () => ({ data: { user: { identities } } }) } } }) as never;

  it('uses the GitHub account id, not a name saved earlier', async () => {
    expect(await provenGithubLogin(db([]), { id: 'p1', provider: 'github', github_id: 7 }, github({ 7: 'ethan' }))).toBe('ethan');
  });
  it('follows a GitLab account to the GitHub account it linked, by id', async () => {
    const linked = db([{ provider: 'github', identity_data: { provider_id: '9' } }]);
    expect(await provenGithubLogin(linked, { id: 'p2', provider: 'gitlab' }, github({ 9: 'maya' }))).toBe('maya');
  });
  it('drops a linked name its GitHub account has given up, so the new owner keeps their projects', async () => {
    // The GitLab user linked GitHub account 9 when it was called "ethan"; it is now "ethan-old".
    const linked = db([{ provider: 'github', identity_data: { provider_id: '9' } }]);
    const login = await provenGithubLogin(linked, { id: 'p2', provider: 'gitlab' }, github({ 9: 'ethan-old' }));
    expect(canOffer({ kind: 'project', fullName: 'ethan/brand-kit' }, { githubLogin: login, personId: 'p2' })).toBe(false);
  });
  it('refuses when there is no linked GitHub account or GitHub cannot be asked', async () => {
    expect(await provenGithubLogin(db([]), { id: 'p3', provider: 'gitlab' }, github({}))).toBeNull();
    expect(await provenGithubLogin(db([]), { id: 'p4', provider: 'github', github_id: 7 }, github({}))).toBeNull();
  });
});
