import { describe, expect, it } from 'vitest';
import { OPEN_FILES, publicGap, sitemapPaths } from '../src/lib/opendata';

describe('publicGap', () => {
  const row = {
    id: 'x', slug: 'brand-kit', title: 'Brand kit', pitch: 'p', missing: 'm', build_status: 'wanted', merged_into: null,
    author_id: 'secret', backer_id: 'secret', words: ['logo'], created_at: '2026-11-12', people: { handle: 'someone' },
  };
  it('keeps what the gap says and drops who posted it', () => {
    const g = publicGap(row as any, { want: 4 }, null, ['calendly']);
    expect(g).toEqual({ slug: 'brand-kit', title: 'Brand kit', pitch: 'p', missing: 'm', build_status: 'wanted', want: 4, merged_into_slug: null, products: ['calendly'], words: ['logo'], created_at: '2026-11-12' });
    for (const key of ['author', 'author_id', 'backer_id', 'visitor', 'user_id', 'people', 'id']) expect(Object.keys(g)).not.toContain(key);
  });
});

describe('sitemapPaths', () => {
  it('lists indexable projects only, tracked topics, products and unmerged gaps', () => {
    const paths = sitemapPaths({
      products: ['calendly'],
      topics: [{ slug: 'scheduling', tracked: true }, { slug: 'misc', tracked: false }],
      projects: [{ full_name: 'calcom/cal.com', indexable: true }, { full_name: 'tiny/thing', indexable: false }],
      gaps: ['brand-kit'],
    });
    expect(paths).toContain('/free-alternatives/calendly');
    expect(paths).toContain('/topics/scheduling');
    expect(paths).not.toContain('/topics/misc');
    expect(paths).toContain('/projects/calcom/cal.com');
    expect(paths).not.toContain('/projects/tiny/thing');
    expect(paths).toContain('/ideas/brand-kit');
    expect(paths).toContain('/hackathon');
  });
});

describe('OPEN_FILES', () => {
  it('names the five public data files', () => {
    expect(OPEN_FILES).toEqual(['products', 'topics', 'projects', 'gaps', 'merges']);
  });
});
