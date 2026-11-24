import { describe, expect, it } from 'vitest';
import { ADOPTION_TERMS, canOffer, parseTerms } from '../src/lib/adoptions';

describe('who can hand something off', () => {
  it('lets the owner of a repo offer their project', () => {
    expect(canOffer({ kind: 'project', fullName: 'Ethan/brand-kit' }, { login: 'ethan', personId: 'p1' })).toBe(true);
    expect(canOffer({ kind: 'project', fullName: 'someone/brand-kit' }, { login: 'ethan', personId: 'p1' })).toBe(false);
  });
  it('lets the starter or a builder on a gap offer it', () => {
    expect(canOffer({ kind: 'gap', startedBy: 'ethan', claimers: [] }, { login: 'Ethan', personId: 'p1' })).toBe(true);
    expect(canOffer({ kind: 'gap', startedBy: 'maya', claimers: ['p1'] }, { login: 'ethan', personId: 'p1' })).toBe(true);
    expect(canOffer({ kind: 'gap', startedBy: 'maya', claimers: [] }, { login: 'ethan', personId: 'p1' })).toBe(false);
  });
});

describe('terms', () => {
  it('has the four terms, in plain words', () => {
    expect(ADOPTION_TERMS.map((t) => t.key)).toEqual(['open_source', 'credit', 'advise', 'ask_first']);
  });
  it('keeps only known terms, once each', () => {
    const f = new FormData();
    for (const t of ['credit', 'credit', 'open_source', 'pay_me']) f.append('terms', t);
    expect(parseTerms(f)).toEqual(['open_source', 'credit']);
  });
});

describe('review fixes: a gap is offered by its poster, matched by account', () => {
  it('lets the person who posted it offer it, whatever their username is now', () => {
    expect(canOffer({ kind: 'gap', authorId: 'p1', startedBy: 'old-name', claimers: [] }, { login: 'new-name', personId: 'p1' })).toBe(true);
    expect(canOffer({ kind: 'gap', authorId: 'p1', startedBy: 'sam', claimers: [] }, { login: 'sam', personId: 'p2' })).toBe(false);
  });
});
