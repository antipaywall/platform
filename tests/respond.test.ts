import { describe, expect, it } from 'vitest';
import { back, MESSAGES, safeNext } from '../src/lib/respond';

describe('safeNext', () => {
  it('allows our own paths', () => {
    expect(safeNext('/ideas/brand-kit')).toBe('/ideas/brand-kit');
    expect(safeNext('/fund')).toBe('/fund');
  });
  it.each(['//evil.example', '//1746049812', 'https://evil.example', '/\\evil', '/a?b=c', '', null])('refuses %s', (v) => {
    expect(safeNext(v as string | null)).toBe('/join');
  });
});

describe('back', () => {
  it('redirects with a message code, not text', () => {
    const res = back('/fund', 'pledge_listed');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/fund?m=pledge_listed');
  });
  it('keeps a #section after the code, where a browser will still read both', () => {
    expect(back('/join#follow', 'subscribed').headers.get('location')).toBe('/join?m=subscribed#follow');
  });
  it('has a kind and text for every code', () => {
    for (const m of Object.values(MESSAGES)) {
      expect(['ok', 'error']).toContain(m.kind);
      expect(m.text.length).toBeGreaterThan(3);
    }
  });
});
