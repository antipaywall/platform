// Explore: every open-source project Antipaywall tracks, filtered and sorted.

import type { SupabaseClient } from '@supabase/supabase-js';

export const PER_PAGE = 48;
export const SORTS = { stars: 'Most stars', recent: 'Recently updated', contributors: 'Most contributors' } as const;
export type Sort = keyof typeof SORTS;
export const LICENSES = { any: 'Any license', permissive: 'Use it anywhere (MIT, Apache, BSD…)', copyleft: 'Share your changes (GPL, AGPL…)' } as const;
export type LicenseGroup = keyof typeof LICENSES;

const PERMISSIVE = ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', '0BSD', 'CC0-1.0', 'Zlib'];
const COPYLEFT = ['GPL-2.0', 'GPL-3.0', 'AGPL-3.0', 'LGPL-2.1', 'LGPL-3.0', 'MPL-2.0', 'EPL-2.0'];

export type ExploreQuery = { q: string; all: boolean; category: string; topic: string; license: LicenseGroup; sort: Sort; page: number };

/** Reads the filters from the address, ignoring anything it doesn't recognise. */
export function parseExplore(params: URLSearchParams): ExploreQuery {
  const sort = params.get('sort') ?? '';
  const license = params.get('license') ?? '';
  const page = Number(params.get('page'));
  return {
    q: (params.get('q') ?? '').replace(/[^\p{L}\p{N}\s.+#-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60),
    all: params.get('show') === 'all',
    category: (params.get('category') ?? '').slice(0, 40),
    topic: /^[a-z0-9]+(-[a-z0-9]+)*$/.test(params.get('topic') ?? '') ? params.get('topic')! : '',
    license: license in LICENSES ? (license as LicenseGroup) : 'any',
    sort: sort in SORTS ? (sort as Sort) : 'stars',
    page: Number.isInteger(page) && page > 0 && page < 500 ? page : 1,
  };
}

/** The address for a set of filters, leaving out the defaults. */
export function exploreHref(q: ExploreQuery, change: Partial<ExploreQuery> = {}): string {
  const v = { ...q, ...(Object.keys(change).some((k) => k !== 'page') ? { page: 1 } : {}), ...change };
  const p = new URLSearchParams();
  if (v.q) p.set('q', v.q);
  if (v.all) p.set('show', 'all');
  if (v.category) p.set('category', v.category);
  if (v.topic) p.set('topic', v.topic);
  if (v.license !== 'any') p.set('license', v.license);
  if (v.sort !== 'stars') p.set('sort', v.sort);
  if (v.page > 1) p.set('page', String(v.page));
  const s = p.toString();
  return s ? `/explore?${s}` : '/explore';
}

export type ExploreResult = {
  total: number;
  items: { fullName: string; description: string | null; stars: number; license: string | null; pushedAt: string | null; replaces: string[] }[];
};

export async function explore(db: SupabaseClient, f: ExploreQuery): Promise<ExploreResult> {
  const cols = 'id, full_name, description, stars, license_spdx, license_name, pushed_at, contributors';
  // By default only projects known to replace a paid tool; "show=all" opens up everything synced.
  let q = f.category
    ? db.from('projects').select(`${cols}, project_products!inner(products!inner(category))`, { count: 'exact' }).eq('project_products.products.category', f.category)
    : f.all
      ? db.from('projects').select(cols, { count: 'exact' })
      : db.from('projects').select(`${cols}, project_products!inner(product_id)`, { count: 'exact' });
  // Lists of links ("awesome lists") are reading, not software you can switch to.
  q = q.eq('listed', true).not('topics', 'ov', '{awesome,awesome-list}');
  if (f.topic) q = q.contains('topics', [f.topic]);
  if (f.license === 'permissive') q = q.in('license_spdx', PERMISSIVE);
  if (f.license === 'copyleft') q = q.in('license_spdx', COPYLEFT);
  if (f.q) {
    const like = `%${f.q.replace(/[%_\\,()]/g, ' ')}%`;
    q = q.or(`full_name.ilike.${like},description.ilike.${like}`);
  }
  q = f.sort === 'recent' ? q.order('pushed_at', { ascending: false }) : f.sort === 'contributors' ? q.order('contributors', { ascending: false, nullsFirst: false }) : q.order('stars', { ascending: false });
  const from = (f.page - 1) * PER_PAGE;
  const { data, count, error } = await q.order('id').range(from, from + PER_PAGE - 1);
  // Past the last page: nothing to show, but say how many there are.
  if (error && /range not satisfiable/i.test(error.message)) return { total: count ?? 0, items: [] };
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as any[];
  const links = rows.length
    ? (((await db.from('project_products').select('project_id, products(name)').in('project_id', rows.map((r) => r.id))).data ?? []) as any[])
    : [];
  const replaces = new Map<string, string[]>();
  for (const l of links) if (l.products?.name) replaces.set(l.project_id, [...(replaces.get(l.project_id) ?? []), l.products.name]);
  return {
    total: count ?? rows.length,
    items: rows.map((r) => ({
      fullName: r.full_name, description: r.description, stars: r.stars,
      license: r.license_spdx ?? (r.license_name ? 'Own license' : null), pushedAt: r.pushed_at, replaces: replaces.get(r.id) ?? [],
    })),
  };
}
