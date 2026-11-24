import { describe, expect, it } from 'vitest';
import { breadcrumbs, categorySlug, faqData, ldGraph, listWords, projectSummary, toolAnswer, toolQuestions, trimAtWord } from '../src/lib/seo';
import { fromSync, sitemapPaths } from '../src/lib/opendata';

const projects = [
  { name: 'AppFlowy', stars: 68000, license: 'AGPL-3.0' },
  { name: 'AFFiNE', stars: 50000, license: 'Own license' },
  { name: 'Anytype', stars: 6000, license: null },
  { name: 'Joplin', stars: 70000, license: 'AGPL-3.0' },
  { name: 'Logseq', stars: 40000, license: 'AGPL-3.0' },
];

describe('ldGraph', () => {
  it('puts the site and the page in one graph and drops page contexts', () => {
    const g = JSON.parse(ldGraph({ '@context': 'https://schema.org', '@type': 'ItemList', name: 'x' }));
    expect(g['@context']).toBe('https://schema.org');
    expect(g['@graph'].map((x: any) => x['@type'])).toEqual(['Organization', 'WebSite', 'ItemList']);
    expect(g['@graph'][2]['@context']).toBeUndefined();
  });
  it('skips empty items and cannot close the script tag', () => {
    const s = ldGraph([null, { '@type': 'Thing', name: '</script><script>alert(1)</script>' }]);
    expect(s).not.toContain('</script>');
    expect(JSON.parse(s)['@graph']).toHaveLength(3);
  });
  it('has the site entries with no page data', () => {
    expect(JSON.parse(ldGraph(undefined))['@graph']).toHaveLength(2);
  });
});

describe('breadcrumbs and questions', () => {
  it('numbers steps and makes full addresses', () => {
    const b = breadcrumbs([['Find', '/free-alternatives'], ['Notion', '/free-alternatives/notion']]) as any;
    expect(b.itemListElement[1]).toEqual({ '@type': 'ListItem', position: 2, name: 'Notion', item: 'https://www.antipaywall.org/free-alternatives/notion' });
  });
  it('makes no question data from no questions', () => {
    expect(faqData([])).toBeNull();
    expect((faqData([{ q: 'Q?', a: 'A.' }]) as any).mainEntity[0].acceptedAnswer.text).toBe('A.');
  });
});

describe('toolAnswer', () => {
  it('names the first project with its facts and the next three, in page order', () => {
    expect(toolAnswer({ name: 'Notion', price: null }, projects)).toBe(
      'The top free, open-source alternatives to Notion are AppFlowy (68k GitHub stars, AGPL-3.0 license), AFFiNE, Anytype, Joplin and 1 more.',
    );
  });
  it('handles one, two and none', () => {
    expect(toolAnswer({ name: 'X', price: null }, projects.slice(0, 1))).toBe('The free, open-source alternative to X is AppFlowy (68k GitHub stars, AGPL-3.0 license).');
    expect(toolAnswer({ name: 'X', price: null }, projects.slice(0, 2))).toContain('AGPL-3.0 license) and AFFiNE.');
    expect(toolAnswer({ name: 'X', price: null }, [])).toBeNull();
  });
});

describe('toolQuestions', () => {
  it('answers from the list: count, most starred, price, hosting and what is missing', () => {
    const qa = toolQuestions({ name: 'Notion', price: 'about $10 a month' }, projects, ['Offline sync', 'Databases']);
    expect(qa.map((x) => x.q)).toEqual([
      'Is there a free alternative to Notion?',
      'What is the most popular open-source alternative to Notion?',
      'How much does Notion cost?',
      'Can I host a free Notion alternative myself?',
      'What do the free Notion alternatives still not do?',
    ]);
    expect(qa[0].a).toContain('5 free, open-source projects');
    expect(qa[1].a).toBe('By GitHub stars, it is Joplin, with 70k GitHub stars (AGPL-3.0 license).');
    expect(qa[4].a).toBe('People here say they still want: Offline sync and Databases.');
  });
  it('says plainly when there is none, with no hosting question', () => {
    const qa = toolQuestions({ name: 'Figma', price: null }, [], []);
    expect(qa).toHaveLength(1);
    expect(qa[0].a).toMatch(/^Not yet\./);
  });
});

describe('text helpers', () => {
  it('cuts at a word', () => {
    expect(trimAtWord('find, prove, fix and monitor vulnerabilities across code, binaries, dependencies', 60)).toBe('find, prove, fix and monitor vulnerabilities across code…');
    expect(trimAtWord('short', 60)).toBe('short');
  });
  it('joins words', () => {
    expect(listWords([])).toBe('');
    expect(listWords(['a'])).toBe('a');
    expect(listWords(['a', 'b', 'c'])).toBe('a, b and c');
  });
  it('makes category addresses', () => {
    expect(categorySlug('Sales and CRM')).toBe('sales-and-crm');
    expect(categorySlug('Docs & notes')).toBe('docs-and-notes');
  });
});

describe('projectSummary', () => {
  it('says what it replaces, its license and who works on it', () => {
    expect(projectSummary({ name: 'Cal.com', stars: 35000, license: 'AGPL-3.0', contributors: 600, pushedAgo: '2 days ago', started: '2021', replaces: ['Calendly'] })).toBe(
      'Cal.com is a free, open-source alternative to Calendly, with 35k GitHub stars. It is released under the AGPL-3.0 license. 600 people have contributed; it was started in 2021, last changed 2 days ago.',
    );
  });
  it('is plain about a missing license and missing facts', () => {
    expect(projectSummary({ name: 'X', stars: 1, license: 'No license', contributors: null, pushedAgo: null, started: null, replaces: [] })).toBe(
      'X is a free, open-source project on GitHub, with 1 GitHub star. No license was found for it.',
    );
  });
});

describe('sitemap', () => {
  it('lists category pages and marks the pages the sync changes', () => {
    const paths = sitemapPaths({ products: ['notion'], categories: ['docs-and-notes'], topics: [], projects: [], gaps: [] });
    expect(paths).toContain('/free-alternatives/category/docs-and-notes');
    expect(fromSync('/free-alternatives/notion')).toBe(true);
    expect(fromSync('/projects/a/b')).toBe(true);
    expect(fromSync('/free-alternatives')).toBe(false);
    expect(fromSync('/hackathon')).toBe(false);
  });
});
