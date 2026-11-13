// The open data: everything that decides what the directory shows, free to download (CC0), so
// anyone could rerun the matching, check our work, or carry the whole thing on without us.
// Gaps go out without anything about who posted or backed them.

import type { SupabaseClient } from '@supabase/supabase-js';
import { demandFor } from './gaps';

export const OPEN_FILES = ['products', 'topics', 'projects', 'gaps', 'merges'] as const;
export type OpenFile = (typeof OPEN_FILES)[number];

export function publicGap(row: { slug: string; title: string; pitch: string; missing: string; build_status: string; words: string[]; created_at: string }, demand: { want: number } | undefined, mergedIntoSlug: string | null, products: string[]) {
  return {
    slug: row.slug, title: row.title, pitch: row.pitch, missing: row.missing, build_status: row.build_status,
    want: demand?.want ?? 0, merged_into_slug: mergedIntoSlug, products, words: row.words ?? [], created_at: row.created_at,
  };
}

const STATIC = ['/', '/free-alternatives', '/topics', '/hackathon', '/about', '/join', '/join/build', '/join/panel', '/join/organize', '/ideas', '/pool', '/fund', '/sponsor', '/builders', '/rules', '/faq', '/privacy', '/terms'];

export function sitemapPaths(d: { products: string[]; topics: { slug: string; tracked: boolean }[]; projects: { full_name: string; indexable: boolean }[]; gaps: string[] }): string[] {
  return [
    ...STATIC,
    ...d.products.map((s) => `/free-alternatives/${s}`),
    ...d.topics.filter((t) => t.tracked).map((t) => `/topics/${t.slug}`),
    ...d.projects.filter((p) => p.indexable).map((p) => `/projects/${p.full_name}`),
    ...d.gaps.map((s) => `/ideas/${s}`),
  ];
}

export async function openData(db: SupabaseClient, file: OpenFile): Promise<unknown[]> {
  if (file === 'products') {
    const { data, error } = await db.from('products').select('slug, name, category, price_cents, price_period, words, topics, search_terms, aliases, excludes, blurb').order('slug');
    if (error) throw new Error(error.message);
    return data ?? [];
  }
  if (file === 'topics') {
    const { data, error } = await db.from('topics').select('slug, name, blurb, tracked').order('slug');
    if (error) throw new Error(error.message);
    return data ?? [];
  }
  if (file === 'projects') {
    const { data, error } = await db
      .from('projects')
      .select('full_name, url, description, homepage, topics, license_spdx, stars, forks, open_issues, help_wanted, good_first, contributors, pushed_at, created_on_github, latest_release_tag, star_points, project_products(source, products(slug))')
      .eq('listed', true)
      .order('stars', { ascending: false })
      .limit(20000);
    if (error) throw new Error(error.message);
    return (data ?? []).map((p: any) => {
      const { project_products, ...rest } = p;
      return { ...rest, products: (project_products ?? []).map((l: any) => ({ slug: l.products?.slug, source: l.source })).filter((l: any) => l.slug) };
    });
  }
  if (file === 'gaps') {
    const { data, error } = await db.from('ideas').select('id, slug, title, pitch, missing, build_status, words, created_at, merged_into, gap_products(products(slug))').eq('status', 'listed').order('created_at');
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    const slugOf = new Map(rows.map((r) => [r.id, r.slug]));
    const demand = await demandFor(db, rows.map((r) => r.id));
    return rows.map((r) => publicGap(r, demand.get(r.id), r.merged_into ? slugOf.get(r.merged_into) ?? null : null, (r.gap_products ?? []).map((g: any) => g.products?.slug).filter(Boolean)));
  }
  const { data, error } = await db.from('merge_log').select('source, reason, created_at, undone_at, from:from_idea(slug), into:into_idea(slug)').order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []).map((m: any) => ({ from: m.from?.slug, into: m.into?.slug, source: m.source, reason: m.reason, created_at: m.created_at, undone_at: m.undone_at }));
}

export async function sitemapData(db: SupabaseClient) {
  const [products, topics, projects, gaps] = await Promise.all([
    db.from('products').select('slug'),
    db.from('topics').select('slug, tracked'),
    db.from('projects').select('full_name, indexable').eq('listed', true).eq('indexable', true).limit(50000),
    db.from('ideas').select('slug').eq('status', 'listed').is('merged_into', null),
  ]);
  return {
    products: (products.data ?? []).map((p) => p.slug as string),
    topics: (topics.data ?? []) as { slug: string; tracked: boolean }[],
    projects: (projects.data ?? []) as { full_name: string; indexable: boolean }[],
    gaps: (gaps.data ?? []).map((g) => g.slug as string),
  };
}
