import { describe, expect, it } from 'vitest';
import { CatalogError, isBlocked, loadCatalog, parseProduct } from '../src/lib/catalog';

const minimal = { slug: 'calendly', name: 'Calendly', category: 'Scheduling', blurb: 'Booking links for meetings.' };

describe('parseProduct', () => {
  it('accepts a minimal product and fills the lists with empty ones', () => {
    const p = parseProduct(minimal, 'calendly.yml');
    expect(p).toMatchObject({ slug: 'calendly', name: 'Calendly', category: 'Scheduling', words: [], topics: [], search_terms: [], aliases: [], excludes: [] });
    expect(p.price).toBeUndefined();
  });
  it('rejects a slug that is not lowercase words joined by dashes', () => {
    expect(() => parseProduct({ ...minimal, slug: 'Calendly!' }, 'x.yml')).toThrow(CatalogError);
  });
  it('rejects a name over 60 characters', () => {
    expect(() => parseProduct({ ...minimal, name: 'x'.repeat(61) }, 'x.yml')).toThrow(/name/);
  });
  it('rejects an unknown category', () => {
    expect(() => parseProduct({ ...minimal, category: 'Stuff' }, 'x.yml')).toThrow(/category/);
  });
  it('rejects a negative price', () => {
    expect(() => parseProduct({ ...minimal, price: { cents: -1, period: 'month' } }, 'x.yml')).toThrow(/price/);
  });
  it('rejects more than 40 words', () => {
    expect(() => parseProduct({ ...minimal, words: Array.from({ length: 41 }, (_, i) => `w${i}`) }, 'x.yml')).toThrow(/words/);
  });
  it('names the file in its error', () => {
    expect(() => parseProduct({ ...minimal, category: 'Stuff' }, 'bad.yml')).toThrow(/bad\.yml/);
  });
});

describe('isBlocked', () => {
  const words = ['crack', 'keygen', 'free download'];
  it('catches a whole blocked word or phrase', () => {
    expect(isBlocked('GTA 6 free download crack', words)).toBe(true);
    expect(isBlocked('KEYGEN for anything', words)).toBe(true);
  });
  it('ignores a blocked word inside a longer word', () => {
    expect(isBlocked('Crackle chat', words)).toBe(false);
  });
});

describe('the catalog in the repo', () => {
  const catalog = loadCatalog();
  it('loads every file without errors', () => {
    expect(catalog.topics.length).toBeGreaterThan(0);
    expect(catalog.blocklist.words.length).toBeGreaterThan(0);
  });
  it('has unique product slugs', () => {
    const slugs = catalog.products.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
  it('has unique topic slugs', () => {
    const slugs = catalog.topics.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
