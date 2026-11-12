import { describe, expect, it } from 'vitest';
import { parseWriteup } from '../src/lib/forms';

describe('parseWriteup', () => {
  it('accepts an empty write-up', () => {
    expect(parseWriteup({})).toEqual({ ok: true, problem: '', build: '', strong: '', sourceUrl: null, search: '' });
  });
  it('keeps paragraph breaks and tidies spacing', () => {
    const got = parseWriteup({ problem: '  First   line.\r\n\r\n\r\n\r\nSecond.  ' });
    expect(got.ok && got.problem).toBe('First line.\n\nSecond.');
  });
  it('refuses a part over 1,200 characters', () => {
    expect(parseWriteup({ build: 'x'.repeat(1201) })).toEqual({ ok: false, error: 'bad_writeup' });
    expect(parseWriteup({ build: 'x'.repeat(1200) }).ok).toBe(true);
  });
  it('only takes an https source link', () => {
    expect(parseWriteup({ sourceUrl: 'https://example.com/pricing' })).toMatchObject({ ok: true, sourceUrl: 'https://example.com/pricing' });
    expect(parseWriteup({ sourceUrl: 'http://example.com' }).ok).toBe(false);
    expect(parseWriteup({ sourceUrl: 'javascript:alert(1)' }).ok).toBe(false);
  });
  it('limits the search phrase to 120 characters', () => {
    expect(parseWriteup({ search: 'x'.repeat(121) }).ok).toBe(false);
    expect(parseWriteup({ search: '  loom   alternative ' })).toMatchObject({ search: 'loom alternative' });
  });
  it('keeps markup as plain text', () => {
    const got = parseWriteup({ strong: '<script>alert(1)</script>' });
    expect(got.ok && got.strong).toBe('<script>alert(1)</script>');
  });
});
