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

// Words that say nothing about what someone wants.
const FILLER = new Set(('a an and any app apps are as at be best but by can do does for free from get good have how i in is it like me my need ' +
  'of on open or similar so software some something source that the this to tool tools want way what which with without you your alternative alternatives version').split(' '));

/** The words of a search that carry meaning. */
export const queryWords = (q: string) => normalizeQuery(q).split(' ').filter((w) => w.length > 1 && !FILLER.has(w));

const stem = (w: string) => w.slice(0, Math.max(4, w.length - 2));

/**
 * Orders results by how many of the search's words each one contains (word stems, so "invoice"
 * finds "invoicing"), keeping only those with at least `min`. Ties keep the database's order.
 */
export function rankByWords<T extends { text: string }>(items: T[], words: string[], min: number): T[] {
  const stems = words.map(stem);
  const matched = items.map((item, i) => {
    const tokens = item.text.toLowerCase().split(/[^\p{L}\p{N}+#]+/u);
    return { item, i, found: stems.filter((s) => tokens.some((t) => t.startsWith(s))) };
  });
  // A word few results contain says more about what someone wants than one most of them share.
  const df = new Map(stems.map((s) => [s, matched.filter((m) => m.found.includes(s)).length]));
  return matched
    .filter((m) => m.found.length >= min)
    .map((m) => ({ ...m, score: m.found.reduce((sum, s) => sum + 1 / (df.get(s) || 1), 0) }))
    .sort((a, b) => b.found.length - a.found.length || b.score - a.score || a.i - b.i)
    .map((m) => m.item);
}

export async function findMatches(db: SupabaseClient, q: string, limit = 8): Promise<Matches> {
  const clean = normalizeQuery(q);
  if (clean.length < 2) return { products: [], gaps: [], projects: [], topics: [] };
  const words = queryWords(clean);
  const { data, error } = await db.rpc('match_candidates', { p_q: words.length ? words.join(' ') : clean, p_limit: limit * 3 });
  if (error) throw new Error(error.message);
  const raw = toMatches(data);
  if (!words.length) return { products: raw.products.slice(0, limit), gaps: raw.gaps.slice(0, limit), projects: raw.projects.slice(0, limit), topics: raw.topics.slice(0, limit) };
  // Re-rank with what each result says about itself, so the one matching more of the words leads.
  const productText = new Map<string, string>();
  if (raw.products.length) {
    const { data: rows } = await db.from('products').select('slug, name, aliases, words, blurb').in('slug', raw.products.map((p) => p.slug));
    for (const r of (rows ?? []) as any[]) productText.set(r.slug, [r.name, ...(r.aliases ?? []), ...(r.words ?? []), r.blurb].join(' '));
  }
  // A project must match two words of a longer search: one shared common word brings in noise.
  const projectMin = words.length >= 2 ? 2 : 1;
  return {
    products: rankByWords(raw.products.map((p) => ({ ...p, text: productText.get(p.slug) ?? p.name })), words, 1).slice(0, limit).map(({ slug, name }) => ({ slug, name })),
    gaps: rankByWords(raw.gaps.map((g) => ({ ...g, text: g.title })), words, 1).slice(0, limit).map(({ slug, title }) => ({ slug, title })),
    projects: rankByWords(raw.projects.map((p) => ({ ...p, text: `${p.fullName.replace(/[/_.-]/g, ' ')} ${p.description ?? ''}` })), words, projectMin)
      .slice(0, limit)
      .map(({ fullName, description, stars }) => ({ fullName, description, stars })),
    topics: rankByWords(raw.topics.map((t) => ({ ...t, text: `${t.name} ${t.slug.replace(/-/g, ' ')}` })), words, 1).slice(0, limit).map(({ slug, name }) => ({ slug, name })),
  };
}

/** Nothing a person was after: no paid product and no wish matched. */
export const isWeak = (m: Matches) => m.products.length === 0 && m.gaps.length === 0;

/** Counts a search that found nothing good, without anything about who searched. Never throws. */
export async function recordMiss(db: SupabaseClient, q: string): Promise<void> {
  const clean = normalizeQuery(q);
  if (clean.length < 3) return;
  await db.rpc('record_search_miss', { p_q: clean }).then(() => undefined, () => undefined);
}
