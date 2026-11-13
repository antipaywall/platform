import { describe, expect, it } from 'vitest';
import { acceptMerges, mergeWords } from '../src/lib/matchProposals';

describe('acceptMerges', () => {
  const gaps = ['a', 'b', 'c', 'd'];
  it('keeps proposals between real, different, unmerged gaps', () => {
    expect(acceptMerges([{ from: 'b', into: 'a', reason: 'Same wish' }], { gaps, merged: new Set(), blocked: new Set(), existing: [] })).toEqual([{ from: 'b', into: 'a', reason: 'Same wish' }]);
  });
  it('drops a pair someone said is not the same, in either order', () => {
    expect(acceptMerges([{ from: 'b', into: 'a', reason: 'x' }], { gaps, merged: new Set(), blocked: new Set(['a|b']), existing: [] })).toEqual([]);
  });
  it('drops unknown slugs, self-merges, already merged gaps and repeats', () => {
    const out = acceptMerges(
      [{ from: 'z', into: 'a', reason: 'x' }, { from: 'a', into: 'a', reason: 'x' }, { from: 'c', into: 'a', reason: 'x' }, { from: 'd', into: 'a', reason: 'x' }],
      { gaps, merged: new Set(['c']), blocked: new Set(), existing: [{ from: 'd', into: 'a' }] },
    );
    expect(out).toEqual([]);
  });
  it('never merges into a gap that is itself being merged away', () => {
    expect(acceptMerges([{ from: 'b', into: 'a', reason: 'x' }, { from: 'a', into: 'c', reason: 'x' }], { gaps, merged: new Set(), blocked: new Set(), existing: [] })).toEqual([{ from: 'b', into: 'a', reason: 'x' }]);
  });
});

describe('mergeWords', () => {
  it('adds new plain words, lowercase, without repeats, up to 40', () => {
    expect(mergeWords(['booking'], ['Booking', 'take a deposit', ''])).toEqual(['booking', 'take a deposit']);
    expect(mergeWords([], Array.from({ length: 50 }, (_, i) => `w${i}`))).toHaveLength(40);
  });
});
