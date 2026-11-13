import { describe, expect, it } from 'vitest';
import { starsGained, topicName } from '../src/lib/topics';

const now = new Date('2026-11-12T00:00:00Z');

describe('starsGained', () => {
  it('reads growth over the last 30 days from the points', () => {
    const gained = starsGained([['2026-10-01', 100], ['2026-11-12', 160]], 30, now);
    expect(gained).toBeGreaterThanOrEqual(40);
    expect(gained).toBeLessThanOrEqual(60);
  });
  it('is never negative', () => {
    expect(starsGained([['2026-10-01', 200], ['2026-11-12', 150]], 30, now)).toBe(0);
  });
  it('is zero with one point', () => {
    expect(starsGained([['2026-11-12', 150]], 30, now)).toBe(0);
  });
  it('counts all growth when every point is inside the window', () => {
    expect(starsGained([['2026-11-01', 10], ['2026-11-12', 30]], 30, now)).toBe(20);
  });
});

describe('topicName', () => {
  it('turns a GitHub topic into words', () => {
    expect(topicName('video-conferencing')).toBe('Video conferencing');
    expect(topicName('e-commerce')).toBe('E commerce');
  });
});
