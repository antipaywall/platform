import { describe, expect, it } from 'vitest';
import { shortCount, timeAgo } from '../src/lib/format';

describe('shortCount', () => {
  it('writes thousands short', () => {
    expect(shortCount(950)).toBe('950');
    expect(shortCount(3600)).toBe('3.6k');
    expect(shortCount(38000)).toBe('38k');
    expect(shortCount(1_250_000)).toBe('1.3M');
  });
});

describe('timeAgo', () => {
  const now = new Date('2026-11-12T12:00:00Z');
  it('says minutes, hours, yesterday and days', () => {
    expect(timeAgo('2026-11-12T11:58:00Z', now)).toBe('just now');
    expect(timeAgo('2026-11-12T11:20:00Z', now)).toBe('40 minutes ago');
    expect(timeAgo('2026-11-12T10:00:00Z', now)).toBe('2 hours ago');
    expect(timeAgo('2026-11-11T10:00:00Z', now)).toBe('yesterday');
    expect(timeAgo('2026-11-09T12:00:00Z', now)).toBe('3 days ago');
  });
  it('says months and years for older dates', () => {
    expect(timeAgo('2026-08-01T00:00:00Z', now)).toBe('3 months ago');
    expect(timeAgo('2024-10-01T00:00:00Z', now)).toBe('2 years ago');
  });
  it('says "never" for no date', () => {
    expect(timeAgo(null, now)).toBe('never');
  });
});
