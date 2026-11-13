import { describe, expect, it } from 'vitest';
import { badgesFor } from '../src/lib/badges';
import { checkEntryRepo, parseEntryRepo } from '../src/lib/entries';

describe('Season 1 badges', () => {
  const season = (b: ReturnType<typeof badgesFor>) => b.filter((x) => x.kind === 'season').map((x) => x.label);
  it('calls someone who joined but has no entry yet "Interested in Season 1"', () => {
    expect(season(badgesFor({ is_builder: true }, [], {}))).toEqual(['Interested in Season 1']);
  });
  it('calls someone who started their entry a "Season 1 builder"', () => {
    expect(season(badgesFor({ is_builder: true }, [], { entry: true }))).toEqual(['Season 1 builder']);
  });
  it('gives no season badge to someone who never joined', () => {
    expect(season(badgesFor({ is_builder: false }, [], {}))).toEqual([]);
  });
});

describe('parseEntryRepo', () => {
  it('reads owner/name, a GitHub address, or one with .git', () => {
    expect(parseEntryRepo('me/brand-kit')).toEqual({ owner: 'me', name: 'brand-kit' });
    expect(parseEntryRepo('https://github.com/me/brand-kit')).toEqual({ owner: 'me', name: 'brand-kit' });
    expect(parseEntryRepo('https://github.com/me/brand-kit.git')).toEqual({ owner: 'me', name: 'brand-kit' });
  });
  it('refuses anything else', () => {
    for (const bad of ['', 'brand-kit', 'https://gitlab.com/me/x', 'https://github.com/me', 'me/x/y', 'me/..']) expect(parseEntryRepo(bad), bad).toBeNull();
  });
});

describe('checkEntryRepo', () => {
  const repo = (body: object, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  it('accepts a public repo the builder owns', async () => {
    expect(await checkEntryRepo('me', 'kit', 'Me', repo({ id: 9, private: false, full_name: 'me/kit', owner: { login: 'me' } }))).toEqual({ ok: true, githubId: 9, fullName: 'me/kit' });
  });
  it('refuses a repo someone else owns', async () => {
    expect(await checkEntryRepo('other', 'kit', 'me', repo({ id: 9, private: false, full_name: 'other/kit', owner: { login: 'other' } }))).toEqual({ ok: false, reason: 'not_yours' });
  });
  it('refuses a private or missing repo', async () => {
    expect(await checkEntryRepo('me', 'kit', 'me', repo({ id: 9, private: true, full_name: 'me/kit', owner: { login: 'me' } }))).toEqual({ ok: false, reason: 'private' });
    expect(await checkEntryRepo('me', 'kit', 'me', repo({}, 404))).toEqual({ ok: false, reason: 'not_found' });
  });
});
