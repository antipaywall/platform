import { describe, expect, it } from 'vitest';
import { decideUsername, githubHasUser, validUsername } from '../src/lib/usernames';

describe('validUsername', () => {
  it('follows GitHub rules', () => {
    for (const ok of ['a', 'ethanplusai', 'my-name', 'A1', 'x'.repeat(39)]) expect(validUsername(ok), ok).toBe(true);
    for (const bad of ['', '-a', 'a-', 'a--b', 'a_b', 'a.b', 'x'.repeat(40), 'a b']) expect(validUsername(bad), bad).toBe(false);
  });
});

describe('githubHasUser', () => {
  const answer = (status: number) => (async () => new Response('{}', { status })) as unknown as typeof fetch;
  it('says yes, no or unknown from GitHub public profile lookup', async () => {
    expect(await githubHasUser('ethan', answer(200))).toBe('yes');
    expect(await githubHasUser('nobody-here', answer(404))).toBe('no');
    expect(await githubHasUser('x', answer(500))).toBe('unknown');
    expect(await githubHasUser('x', (async () => { throw new Error('down'); }) as unknown as typeof fetch)).toBe('unknown');
  });
});

describe('decideUsername', () => {
  const free = async () => null;
  it('gives a GitHub sign-in its GitHub login', async () => {
    expect(await decideUsername({ id: 'me', provider: 'github', handle: 'Ethan' }, free, async () => 'yes')).toEqual({ username: 'Ethan', bump: null });
  });
  it('takes a GitHub login back from a GitLab builder who held it, who gets renamed', async () => {
    const holder = async (name: string) => (name.toLowerCase() === 'ethan' ? { id: 'other', provider: 'gitlab' as const } : null);
    expect(await decideUsername({ id: 'me', provider: 'github', handle: 'ethan' }, holder, async () => 'yes')).toEqual({ username: 'ethan', bump: 'other' });
  });
  it('keeps a GitLab handle that is free here and unknown to GitHub', async () => {
    expect(await decideUsername({ id: 'me', provider: 'gitlab', handle: 'sam' }, free, async () => 'no')).toEqual({ username: 'sam', bump: null });
  });
  it('asks a GitLab builder to choose when GitHub has that name', async () => {
    expect(await decideUsername({ id: 'me', provider: 'gitlab', handle: 'sam' }, free, async () => 'yes')).toEqual({ choose: true, wanted: 'sam', reason: 'on_github' });
  });
  it('asks a GitLab builder to choose when the name is taken here', async () => {
    const holder = async () => ({ id: 'other', provider: 'github' as const });
    expect(await decideUsername({ id: 'me', provider: 'gitlab', handle: 'sam' }, holder, async () => 'no')).toEqual({ choose: true, wanted: 'sam', reason: 'taken' });
  });
  it('asks to try again when GitHub cannot be reached, rather than giving the name out', async () => {
    expect(await decideUsername({ id: 'me', provider: 'gitlab', handle: 'sam' }, free, async () => 'unknown')).toEqual({ choose: true, wanted: 'sam', reason: 'github_unreachable' });
  });
  it('lets a GitLab builder who connected GitHub take that login', async () => {
    expect(await decideUsername({ id: 'me', provider: 'gitlab', handle: 'sam', githubLogin: 'samuel' }, free, async () => 'yes')).toEqual({ username: 'samuel', bump: null });
  });
  it('keeps the name a person already holds', async () => {
    const holder = async () => ({ id: 'me', provider: 'gitlab' as const });
    expect(await decideUsername({ id: 'me', provider: 'gitlab', handle: 'sam' }, holder, async () => 'yes')).toEqual({ username: 'sam', bump: null });
  });
});

import { checkChosen } from '../src/lib/usernames';

describe('checkChosen', () => {
  const free = async () => null;
  it('accepts a free, valid name nobody has on GitHub', async () => {
    expect(await checkChosen('me', 'sam-builds', free, async () => 'no')).toEqual({ ok: true, username: 'sam-builds' });
  });
  it('refuses a name GitHub has, so its owner can claim it later', async () => {
    expect(await checkChosen('me', 'sam', free, async () => 'yes')).toEqual({ ok: false, reason: 'on_github' });
  });
  it('refuses a name taken here', async () => {
    expect(await checkChosen('me', 'sam', async () => ({ id: 'other', provider: 'github' }), async () => 'no')).toEqual({ ok: false, reason: 'taken' });
  });
  it('refuses an invalid name and an unreachable GitHub', async () => {
    expect(await checkChosen('me', 'a_b', free, async () => 'no')).toEqual({ ok: false, reason: 'invalid' });
    expect(await checkChosen('me', 'sam2', free, async () => 'unknown')).toEqual({ ok: false, reason: 'github_unreachable' });
  });
});

describe('a GitLab builder who already chose a name', () => {
  it('keeps it at their next sign-in', async () => {
    const holder = async (n: string) => (n === 'sam-builds' ? { id: 'me', provider: 'gitlab' as const } : null);
    expect(await decideUsername({ id: 'me', provider: 'gitlab', handle: 'sam', current: 'sam-builds' }, holder, async () => 'yes')).toEqual({ username: 'sam-builds', bump: null });
  });
});
