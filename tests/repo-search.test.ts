import { describe, expect, it } from 'vitest';
import { rankRepoHits, repoQueries, searchRepos } from '../src/lib/github';

const hit = (fullName: string, description: string, stars: number, topics: string[] = []) => ({ fullName, url: `https://github.com/${fullName}`, description, stars, license: 'MIT', topics });

describe('repoQueries', () => {
  it('searches by the words that carry meaning, not the whole sentence', () => {
    const qs = repoQueries('A brand design skill that makes good logos');
    expect(qs[0]).toBe('brand design skill makes logos in:name,description,topics fork:false archived:false');
    expect(qs).toContain('brand design skill in:name,description,topics fork:false archived:false');
    expect(qs).toContain('topic:brand topic:design fork:false archived:false');
    expect(qs.length).toBeLessThanOrEqual(4);
  });
  it('looks for alternatives to a paid tool named in the idea', () => {
    expect(repoQueries('A free replacement for Formspree')).toContain('Formspree alternative in:name,description,topics fork:false archived:false');
  });
  it('has nothing to search for when only filler is typed', () => {
    expect(repoQueries('something like that')).toEqual([]);
  });
});

describe('rankRepoHits', () => {
  it('puts the closest match ahead of the most starred, once each, without link lists', () => {
    const out = rankRepoHits(
      [
        [hit('big/thing', 'A design system', 90000), hit('x/awesome-design', 'brand design logos list', 50000, ['awesome-list'])],
        [hit('small/logo-maker', 'Make brand logos and design kits', 300), hit('big/thing', 'A design system', 90000)],
      ],
      'brand design logos',
    );
    expect(out.map((h) => h.fullName)).toEqual(['small/logo-maker']);
  });
  it('keeps single-word matches when the idea is one or two words', () => {
    const out = rankRepoHits([[hit('a/forms', 'form backend', 10), hit('b/other', 'unrelated', 999)]], 'form backend');
    expect(out.map((h) => h.fullName)).toEqual(['a/forms']);
  });
});

describe('searchRepos', () => {
  it('uses the searches that answered and only fails when none did', async () => {
    let n = 0;
    const f = (async () => (n++ === 0 ? new Response('no', { status: 403 }) : new Response(JSON.stringify({ items: [{ full_name: 'a/form-backend', html_url: 'u', description: 'form backend for static sites', stargazers_count: 5, topics: [] }] })))) as unknown as typeof fetch;
    expect((await searchRepos('form backend for static sites', f)).map((h) => h.fullName)).toEqual(['a/form-backend']);
    const down = (async () => new Response('no', { status: 403 })) as unknown as typeof fetch;
    await expect(searchRepos('form backend', down)).rejects.toThrow();
  });
});

import { namedProducts } from '../src/lib/match';
describe('namedProducts', () => {
  const products = [{ name: 'Calendly' }, { name: 'Google Photos' }, { name: 'Cal' }];
  it('finds the paid tools a search names outright', () => {
    expect(namedProducts(products, 'A free replacement for Calendly with deposits')).toEqual([{ name: 'Calendly' }]);
    expect(namedProducts(products, 'google photos but private')).toEqual([{ name: 'Google Photos' }]);
  });
  it('does not match part of a word', () => {
    expect(namedProducts(products, 'calendar sync')).toEqual([]);
  });
});
