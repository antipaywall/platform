// Free matching: what the site does with a search or a new wish. It runs in our own database
// (full-text and fuzzy spelling) and costs nothing per search. No AI model is called.

import type { SupabaseClient } from '@supabase/supabase-js';

export type Matches = {
  products: { slug: string; name: string }[];
  gaps: { slug: string; title: string }[];
  projects: { fullName: string; description: string | null; stars: number }[];
  topics: { slug: string; name: string }[];
};

/** The words of a search, cleaned: lowercase, letters, digits and a few symbols, at most 100 characters. */
export function normalizeQuery(q: string): string {
  return q
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}.+#\s]/gu, ' ')
    .replace(/(^|\s)[.]+|[.]+(\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** Reads match_candidates' answer, dropping anything malformed. */
export function toMatches(raw: any): Matches {
  return {
    products: arr(raw?.products).filter((p) => str(p?.slug) && str(p?.name)).map((p) => ({ slug: p.slug, name: p.name })),
    gaps: arr(raw?.gaps).filter((g) => str(g?.slug) && str(g?.title)).map((g) => ({ slug: g.slug, title: g.title })),
    projects: arr(raw?.projects).filter((p) => str(p?.full_name)).map((p) => ({ fullName: p.full_name, description: typeof p.description === 'string' ? p.description : null, stars: Number(p.stars) || 0 })),
    topics: arr(raw?.topics).filter((t) => str(t?.slug) && str(t?.name)).map((t) => ({ slug: t.slug, name: t.name })),
  };
}

export async function findMatches(db: SupabaseClient, q: string, limit = 8): Promise<Matches> {
  const clean = normalizeQuery(q);
  if (clean.length < 2) return { products: [], gaps: [], projects: [], topics: [] };
  const { data, error } = await db.rpc('match_candidates', { p_q: clean, p_limit: limit });
  if (error) throw new Error(error.message);
  return toMatches(data);
}

/** Nothing a person was after: no paid product and no wish matched. */
export const isWeak = (m: Matches) => m.products.length === 0 && m.gaps.length === 0;

/** Counts a search that found nothing good, without anything about who searched. Never throws. */
export async function recordMiss(db: SupabaseClient, q: string): Promise<void> {
  const clean = normalizeQuery(q);
  if (clean.length < 3) return;
  await db.rpc('record_search_miss', { p_q: clean }).then(() => undefined, () => undefined);
}
