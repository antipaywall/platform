import { describe, expect, it } from 'vitest';
import { BUILD_STATUS, mergeCounts, parseClaim, parseFollow, whereTo } from '../src/lib/gaps';

describe('mergeCounts', () => {
  it('counts a person who backed both gaps once', () => {
    expect(mergeCounts(['u:1', 'v:a'], [['u:1', 'v:b']])).toBe(3);
  });
  it('adds the backers of every merged gap', () => {
    expect(mergeCounts(['u:1'], [['u:2'], ['u:3', 'u:1']])).toBe(3);
  });
});

describe('whereTo', () => {
  it('sends a merged gap to the gap it joined', () => {
    expect(whereTo({ slug: 'old', merged_into_slug: 'kept', status: 'listed' })).toEqual({ redirect: '/ideas/kept' });
  });
  it('shows a listed gap', () => {
    expect(whereTo({ slug: 'kept', merged_into_slug: null, status: 'listed' })).toEqual({ show: true });
  });
  it('hides a gap that is not listed', () => {
    expect(whereTo({ slug: 'x', merged_into_slug: null, status: 'hidden' })).toEqual({ missing: true });
  });
});

describe('BUILD_STATUS', () => {
  it('says each status in plain words', () => {
    expect(BUILD_STATUS.wanted.label).toBe('Nobody has built it yet');
    expect(BUILD_STATUS.building.label).toBe('Being built');
    expect(BUILD_STATUS.exists.label).toBe('Exists now');
  });
});

describe('parseClaim', () => {
  const f = (o: Record<string, string>) => { const d = new FormData(); for (const [k, v] of Object.entries(o)) d.set(k, v); return d; };
  it('accepts a note and a GitHub repo', () => {
    expect(parseClaim(f({ note: 'Building the color engine', repo_url: 'https://github.com/a/b' }))).toEqual({ ok: true, note: 'Building the color engine', repoUrl: 'https://github.com/a/b' });
  });
  it('accepts no note and no repo', () => {
    expect(parseClaim(f({}))).toEqual({ ok: true, note: null, repoUrl: null });
  });
  it('refuses a repo address that is not https GitHub or GitLab', () => {
    expect(parseClaim(f({ repo_url: 'http://github.com/a/b' }))).toEqual({ ok: false, code: 'bad_repo_url' });
    expect(parseClaim(f({ repo_url: 'https://evil.example/github.com/a' }))).toEqual({ ok: false, code: 'bad_repo_url' });
  });
  it('refuses a note over 140 characters', () => {
    expect(parseClaim(f({ note: 'x'.repeat(141) }))).toEqual({ ok: false, code: 'bad_claim_note' });
  });
});

describe('parseFollow', () => {
  const id = '0b5c1d7e-3f2a-4c8b-9d1e-2a3b4c5d6e7f';
  const f = (o: Record<string, string>) => { const d = new FormData(); for (const [k, v] of Object.entries(o)) d.set(k, v); return d; };
  it('accepts following a gap, project, paid product or topic', () => {
    for (const kind of ['gap', 'project', 'tool', 'topic']) expect(parseFollow(f({ subject_kind: kind, subject_id: id, on: '1' }))).toEqual({ ok: true, kind, id, on: true });
  });
  it('refuses following a person here (that has its own route)', () => {
    expect(parseFollow(f({ subject_kind: 'person', subject_id: id, on: '1' }))).toEqual({ ok: false });
  });
});

import { canUnmerge } from '../src/lib/gaps';

describe('review fixes: unmerge', () => {
  it('lets builders and the organizer split merges, not email-only accounts', () => {
    expect(canUnmerge({ person: true, admin: false })).toBe(true);
    expect(canUnmerge({ person: false, admin: false })).toBe(false);
  });
});
