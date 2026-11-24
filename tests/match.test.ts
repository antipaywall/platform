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

import { queryWords, rankByWords } from '../src/lib/match';

describe('ranking search results by how many of the words they match', () => {
  it('drops filler words from a search', () => {
    expect(queryWords('something like a free zapier for my team')).toEqual(['zapier', 'team']);
  });
  it('puts the result matching more words first', () => {
    const items = [
      { id: 'wetransfer', text: 'WeTransfer send large files' },
      { id: 'quickbooks', text: 'QuickBooks invoices bookkeeping send invoices' },
    ];
    expect(rankByWords(items, ['send', 'invoices'], 1).map((i) => i.id)).toEqual(['quickbooks', 'wetransfer']);
  });
  it('keeps only results matching at least the minimum number of words', () => {
    const items = [{ id: 'a', text: 'reviews widget for static sites' }, { id: 'b', text: 'a widget toolkit' }];
    expect(rankByWords(items, ['reviews', 'widget'], 2).map((i) => i.id)).toEqual(['a']);
  });
  it('matches word stems, so "invoice" finds "invoicing"', () => {
    expect(rankByWords([{ id: 'x', text: 'Invoicing for freelancers' }], ['invoice'], 1).map((i) => i.id)).toEqual(['x']);
  });
});

describe('rarer words count for more', () => {
  it('ranks the result with the distinctive word above one sharing only a common word', () => {
    const items = [
      { id: 'wetransfer', text: 'send large files' },
      { id: 'mailchimp', text: 'send newsletters' },
      { id: 'quickbooks', text: 'invoices and bookkeeping' },
    ];
    expect(rankByWords(items, ['send', 'invoices'], 1)[0].id).toBe('quickbooks');
  });
});
