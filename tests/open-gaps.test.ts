import { describe, expect, it } from 'vitest';
import { findOpenGaps } from '../src/lib/products';

const p = (name: string, bestStars: number, cents: number, signals = 0, period: 'month' | 'year' | 'once' = 'month') => ({ name, bestStars, signals, price: { cents, period } });

describe('findOpenGaps', () => {
  it('keeps tools with no widely used free alternative, asked-about first, then dearest', () => {
    const out = findOpenGaps([p('Covered', 40000, 9900), p('Cheap', 0, 500), p('Dear', 300, 9900), p('Asked', 10, 100, 3)]);
    expect(out.map((x) => x.name)).toEqual(['Asked', 'Dear', 'Cheap']);
  });
});
