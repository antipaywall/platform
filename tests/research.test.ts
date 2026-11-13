import { describe, expect, it } from 'vitest';
import { extractAlternativeTo, normalizeProduct, rankCandidates } from '../src/lib/research';

describe('extractAlternativeTo', () => {
  it('finds the product a Show HN title replaces', () => {
    expect(extractAlternativeTo('Show HN: Cal.com – open-source alternative to Calendly')).toEqual(['Calendly']);
  });
  it('keeps a two-word name and stops at a comma', () => {
    expect(extractAlternativeTo('An open source alternative to Google Analytics, Mixpanel')).toEqual(['Google Analytics']);
  });
  it('understands "free version of"', () => {
    expect(extractAlternativeTo('Ask HN: Free version of GTA 6?')).toEqual(['GTA 6']);
  });
  it('understands "replacement for" and "alternatives to"', () => {
    expect(extractAlternativeTo('A self-hosted replacement for Dropbox')).toEqual(['Dropbox']);
    expect(extractAlternativeTo('Open-source alternatives to Notion and Airtable')).toEqual(['Notion']);
  });
  it('ignores lowercase words that are not a name', () => {
    expect(extractAlternativeTo('alternative to nothing in particular')).toEqual([]);
  });
  it('finds more than one mention in a longer comment', () => {
    expect(extractAlternativeTo('I want an alternative to Zapier. Also a free version of Figma.')).toEqual(['Zapier', 'Figma']);
  });
});

describe('normalizeProduct', () => {
  it('drops domain endings and case', () => {
    expect(normalizeProduct('Notion.so')).toBe('notion');
    expect(normalizeProduct('Cal.com')).toBe('cal');
    expect(normalizeProduct(' Google Analytics! ')).toBe('google analytics');
  });
});

describe('rankCandidates', () => {
  it('ranks weak open-source coverage above strong coverage at equal demand', () => {
    const ranked = rankCandidates([
      { name: 'covered', threads: 40, coverageStars: 30000 },
      { name: 'gap', threads: 40, coverageStars: 0 },
    ]);
    const byName = Object.fromEntries(ranked.map((r) => [r.name, r]));
    expect(byName.gap.gapScore).toBeGreaterThan(byName.covered.gapScore);
    expect(ranked[0].name).toBe('gap');
  });
});
