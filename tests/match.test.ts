import { describe, expect, it } from 'vitest';
import { isWeak, normalizeQuery, toMatches } from '../src/lib/match';

describe('normalizeQuery', () => {
  it('drops search syntax and wildcards a person might type', () => {
    expect(normalizeQuery("a%_b & !c:* 'd'")).toBe('a b c d');
  });
  it('keeps the plus and hash in language names', () => {
    expect(normalizeQuery('C++ / C#')).toBe('c++ c#');
  });
  it('keeps letters from other alphabets', () => {
    expect(normalizeQuery('  Café   Crème ')).toBe('café crème');
  });
  it('is at most 100 characters', () => {
    expect(normalizeQuery('x'.repeat(300))).toHaveLength(100);
  });
});

describe('isWeak', () => {
  const none = { products: [], gaps: [], projects: [], topics: [] };
  it('is weak with no paid products and no gaps, whatever projects turned up', () => {
    expect(isWeak({ ...none, projects: [{ fullName: 'a/b', description: null, stars: 1 }] })).toBe(true);
  });
  it('is not weak with a paid product', () => {
    expect(isWeak({ ...none, products: [{ slug: 'calendly', name: 'Calendly' }] })).toBe(false);
  });
});

describe('toMatches', () => {
  it('reads the database answer and drops anything malformed', () => {
    const m = toMatches({
      products: [{ slug: 'calendly', name: 'Calendly', score: 1 }, { slug: 5 }],
      gaps: [{ slug: 'a', title: 'A' }],
      projects: [{ full_name: 'calcom/cal.com', description: 'x', stars: 3 }],
      topics: null,
    });
    expect(m).toEqual({
      products: [{ slug: 'calendly', name: 'Calendly' }],
      gaps: [{ slug: 'a', title: 'A' }],
      projects: [{ fullName: 'calcom/cal.com', description: 'x', stars: 3 }],
      topics: [],
    });
  });
});
