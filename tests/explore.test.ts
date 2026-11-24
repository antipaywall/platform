import { describe, expect, it } from 'vitest';
import { exploreHref, parseExplore } from '../src/lib/explore';

describe('parseExplore', () => {
  it('reads known filters and ignores the rest', () => {
    const f = parseExplore(new URLSearchParams('q=notes&category=Docs and notes&topic=note-taking&license=permissive&sort=recent&page=2&evil=1'));
    expect(f).toEqual({ q: 'notes', all: false, category: 'Docs and notes', topic: 'note-taking', license: 'permissive', sort: 'recent', page: 2 });
  });
  it('falls back to defaults for anything odd', () => {
    expect(parseExplore(new URLSearchParams('sort=drop table&license=x&page=-3&topic=../x'))).toEqual({ q: '', all: false, category: '', topic: '', license: 'any', sort: 'stars', page: 1 });
  });
  it('strips filter syntax from the words', () => {
    expect(parseExplore(new URLSearchParams('q=a,b(c)%')).q).toBe('a b c');
  });
});

describe('exploreHref', () => {
  const base = parseExplore(new URLSearchParams('topic=scheduling&page=3'));
  it('leaves defaults out of the address', () => {
    expect(exploreHref(parseExplore(new URLSearchParams('')))).toBe('/explore');
  });
  it('goes back to page one when a filter changes', () => {
    expect(exploreHref(base, { sort: 'recent' })).toBe('/explore?topic=scheduling&sort=recent');
  });
  it('keeps "show all" in the address', () => {
    expect(exploreHref(base, { all: true })).toBe('/explore?show=all&topic=scheduling');
  });
  it('keeps the filters when only the page changes', () => {
    expect(exploreHref(base, { page: 4 })).toBe('/explore?topic=scheduling&page=4');
  });
});
