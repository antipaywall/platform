import { describe, expect, it } from 'vitest';
import { monthlyCents, priceLabel, productDescription, productTitle } from '../src/lib/products';

describe('productTitle', () => {
  it('names the page for search', () => {
    expect(productTitle('Calendly')).toBe('Free, open-source alternatives to Calendly');
  });
});

describe('productDescription', () => {
  it('fits in 160 characters even for a long name', () => {
    expect(productDescription('x'.repeat(60), 12).length).toBeLessThanOrEqual(160);
  });
  it('says how many and where they come from', () => {
    expect(productDescription('Calendly', 6)).toBe('6 free, open-source alternatives to Calendly, pulled from GitHub, with what people say is still missing.');
  });
  it('reads right with none found yet', () => {
    expect(productDescription('Calendly', 0)).toBe('Free, open-source alternatives to Calendly, pulled from GitHub, with what people say is still missing.');
  });
});

describe('monthlyCents', () => {
  it('turns a yearly price into a monthly one', () => {
    expect(monthlyCents({ cents: 12000, period: 'year' })).toBe(1000);
  });
  it('leaves out one-time prices and unknown ones', () => {
    expect(monthlyCents({ cents: 2999, period: 'once' })).toBe(0);
    expect(monthlyCents(null)).toBe(0);
  });
});

describe('priceLabel', () => {
  it('says "about" because list prices change', () => {
    expect(priceLabel({ cents: 1000, period: 'month' })).toBe('about $10 a month');
    expect(priceLabel({ cents: 2999, period: 'once' })).toBe('about $29.99 once');
    expect(priceLabel({ cents: 220000, period: 'year' })).toBe('about $2,200 a year');
    expect(priceLabel(null)).toBeNull();
  });
});
