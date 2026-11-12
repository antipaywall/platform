import { describe, expect, it } from 'vitest';
import { parseIdea } from '../src/lib/forms';
import { PLATFORM_AUTHOR, postedBy } from '../src/lib/ideas';

describe('postedBy', () => {
  it("shows a person's GitHub handle", () => {
    expect(postedBy({ author: 'ada', byPlatform: false })).toBe('@ada');
  });
  it('shows the platform by name, never as a handle', () => {
    expect(PLATFORM_AUTHOR).toBe('Antipaywall');
    expect(postedBy({ author: 'antipaywall', byPlatform: true })).toBe('Antipaywall');
    expect(postedBy({ author: '', byPlatform: true })).not.toContain('@');
  });
});

describe('an idea posted by the platform', () => {
  it('goes through the same checks as any other idea', () => {
    expect(parseIdea({ title: 'ab' })).toEqual({ ok: false, error: 'bad_title' });
    expect(parseIdea({ title: 'A free form builder', pitch: 'x'.repeat(281) })).toEqual({ ok: false, error: 'bad_pitch' });
    expect(parseIdea({ title: 'A free form builder', missing: 'x'.repeat(601) })).toEqual({ ok: false, error: 'bad_missing' });
  });
  it('may leave the description and what is missing blank', () => {
    expect(parseIdea({ title: 'A free form builder' })).toEqual({ ok: true, title: 'A free form builder', pitch: '', missing: '', slug: 'a-free-form-builder' });
    expect(parseIdea({ title: 'A free form builder', pitch: null, missing: undefined })).toMatchObject({ ok: true, pitch: '', missing: '' });
  });
});
