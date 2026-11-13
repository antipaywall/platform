import { describe, expect, it } from 'vitest';
import { goalBar } from '../src/lib/goal';

describe('goalBar', () => {
  it('fills toward the goal, with the goal circle at the end', () => {
    expect(goalBar(11, 100)).toEqual({ percent: 11, fill: 11, goalAt: 100, over: 0, reached: false });
    expect(goalBar(1, 100).fill).toBe(2); // a single builder still shows
    expect(goalBar(0, 100).fill).toBe(0);
  });
  it('is full and right on the goal at exactly the goal', () => {
    expect(goalBar(100, 100)).toEqual({ percent: 100, fill: 100, goalAt: 100, over: 0, reached: true });
  });
  it('keeps growing past the goal, with the goal circle sliding left', () => {
    const b = goalBar(140, 100);
    expect(b).toMatchObject({ percent: 140, over: 40, reached: true });
    expect(b.goalAt).toBeCloseTo(71.43, 1);
    expect(goalBar(250, 100).goalAt).toBe(40);
  });
  it('never breaks on odd input', () => {
    expect(goalBar(-5, 100)).toMatchObject({ fill: 0, reached: false });
    expect(goalBar(5, 0)).toMatchObject({ reached: true, goalAt: 20 });
  });
});
