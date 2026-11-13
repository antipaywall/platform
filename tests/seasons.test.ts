import { describe, expect, it } from 'vitest';
import { PRIZES, COMMUNITY_CHOICE_PERCENT, pickBriefs } from '../src/lib/seasons';

describe('prizes', () => {
  it('are nine winners: 30 / 18 / 12, five at 6, plus 10% Community Choice, adding to 100', () => {
    expect(PRIZES).toEqual([30, 18, 12, 6, 6, 6, 6, 6]);
    expect(PRIZES.length + 1).toBe(9);
    expect(PRIZES.reduce((a, b) => a + b, 0) + COMMUNITY_CHOICE_PERCENT).toBe(100);
  });
});

describe('pickBriefs', () => {
  const gaps = [
    { id: 'a', slug: 'a', title: 'A', want: 3 },
    { id: 'b', slug: 'b', title: 'B', want: 9 },
    { id: 'c', slug: 'c', title: 'C', want: 5 },
  ];
  it('while collecting, takes the most wanted gaps right now', () => {
    expect(pickBriefs('collecting', gaps, [], 2).map((g) => g.slug)).toEqual(['b', 'c']);
  });
  it('once open, keeps the frozen briefs in their order', () => {
    expect(pickBriefs('open', gaps, [{ idea_id: 'a', rank: 1 }, { idea_id: 'c', rank: 2 }], 5).map((g) => g.slug)).toEqual(['a', 'c']);
  });
});
