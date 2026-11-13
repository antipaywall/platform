import { describe, expect, it } from 'vitest';
import { wantStatus, savedPerMonth } from '../src/lib/personWants';

describe('wantStatus', () => {
  it('calls a paid product someone uses a free version of "switched"', () => {
    expect(wantStatus({ kind: 'product', use: true })).toBe('switched');
  });
  it('calls a gap being built "being built"', () => {
    expect(wantStatus({ kind: 'gap', buildStatus: 'building', claims: 0 })).toBe('building');
    expect(wantStatus({ kind: 'gap', buildStatus: 'wanted', claims: 2 })).toBe('building');
  });
  it('calls a gap nobody is on yet "wanted"', () => {
    expect(wantStatus({ kind: 'gap', buildStatus: 'wanted', claims: 0 })).toBe('wanted');
  });
  it('calls a product someone would switch from or pay for "wanted"', () => {
    expect(wantStatus({ kind: 'product', use: false })).toBe('wanted');
  });
});

describe('savedPerMonth', () => {
  it('adds monthly prices of the products someone switched from, a year counted as twelve months', () => {
    expect(savedPerMonth([{ cents: 1000, period: 'month' }, { cents: 12000, period: 'year' }, { cents: 2999, period: 'once' }, null])).toBe(2000);
  });
});
