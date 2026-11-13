// Topic pages: every listed project sharing a GitHub topic, with the paid products and the
// gaps around it. These are the pages we most want search engines to find.

import type { SupabaseClient } from '@supabase/supabase-js';
import { demandFor } from './gaps';
import { fetchAllRows } from './sync/plan';

/** A GitHub topic in words, for topics nobody has named in the catalog yet. */
export const topicName = (slug: string) => {
  const s = slug.replace(/-/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const DAY = 24 * 3600 * 1000;

/** Stars gained over the last `days`, read off the curve; the value at the window's start is interpolated. */
export function starsGained(points: [string, number][], days: number, now: Date): number {
  const pts = points.map(([d, n]) => [Date.parse(d), n] as [number, number]).filter(([t]) => !Number.isNaN(t)).sort((a, b) => a[0] - b[0]);
  if (pts.length < 2) return 0;
  const start = now.getTime() - days * DAY;
  const last = pts[pts.length - 1][1];
  let atStart = pts[0][1];
  if (pts[0][0] < start) {
    for (let i = 1; i < pts.length; i++) {
      const [t0, n0] = pts[i - 1];
      const [t1, n1] = pts[i];
      if (t1 >= start) {
        atStart = t1 === t0 ? n1 : n0 + ((start - t0) / (t1 - t0)) * (n1 - n0);
        break;
      }
      atStart = n1;
    }
  }
  return Math.max(0, Math.round(last - atStart));
}

export type TopicSort = 'stars' | 'growth' | 'active';
export type TopicPage = {
  topic: { id: string | null; slug: string; name: string; blurb: string; tracked: boolean };
  projects: { fullName: string; name: string; description: string | null; stars: number; gained: number; pushedAt: string | null; license: string | null }[];
  products: { slug: string; name: string }[];
  gaps: { slug: string; title: string; want: number }[];
};

/** At least this many listed projects before an untracked topic gets its own page. */
export const MIN_PROJECTS_UNTRACKED = 5;

export async function getTopicPage(db: SupabaseClient, slug: string, sort: TopicSort, now: Date): Promise<TopicPage | null> {
  const [t, projects, products] = await Promise.all([
    db.from('topics').select('id, slug, name, blurb, tracked').eq('slug', slug).maybeSingle(),
    db.from('projects').select('id, full_name, name, description, stars, pushed_at, license_spdx').eq('listed', true).contains('topics', [slug]).order('stars', { ascending: false }).limit(200),
    db.from('products').select('id, slug, name').contains('topics', [slug]),
  ]);
  const rows = (projects.data ?? []) as any[];
  // Growth over the last 30 days, from the sync's daily counts.
  const since = new Date(now.getTime() - 31 * DAY).toISOString().slice(0, 10);
  const snaps = rows.length
    ? ((await db.from('project_snapshots').select('project_id, day, stars').in('project_id', rows.map((r) => r.id)).gte('day', since).limit(20000)).data ?? [])
    : [];
  const byProject = new Map<string, [string, number][]>();
  for (const s of snaps as { project_id: string; day: string; stars: number }[]) byProject.set(s.project_id, [...(byProject.get(s.project_id) ?? []), [s.day, s.stars]]);
  const list = rows.map((p) => ({
    fullName: p.full_name, name: p.name, description: p.description, stars: p.stars, pushedAt: p.pushed_at, license: p.license_spdx,
    gained: starsGained(byProject.get(p.id) ?? [], 30, now),
  }));
  if (!t.data && list.length < MIN_PROJECTS_UNTRACKED) return null;
  if (sort === 'growth') list.sort((a, b) => b.gained - a.gained || b.stars - a.stars);
  if (sort === 'active') list.sort((a, b) => Date.parse(b.pushedAt ?? '') - Date.parse(a.pushedAt ?? ''));
  const productRows = (products.data ?? []) as { id: string; slug: string; name: string }[];
  let gaps: TopicPage['gaps'] = [];
  if (productRows.length) {
    const g = await db.from('gap_products').select('ideas!inner(id, slug, title, status, merged_into)').in('product_id', productRows.map((p) => p.id)).eq('ideas.status', 'listed').is('ideas.merged_into', null);
    const rows = new Map(((g.data ?? []) as any[]).map((r) => [r.ideas.id, r.ideas]));
    const demand = await demandFor(db, [...rows.keys()]);
    gaps = [...rows.values()].map((r: any) => ({ slug: r.slug, title: r.title, want: demand.get(r.id)?.want ?? 0 })).sort((a, b) => b.want - a.want).slice(0, 8);
  }
  return {
    topic: t.data
      ? { id: t.data.id, slug: t.data.slug, name: t.data.name, blurb: t.data.blurb, tracked: t.data.tracked }
      : { id: null, slug, name: topicName(slug), blurb: '', tracked: false },
    projects: list.slice(0, 60),
    products: productRows.map(({ slug, name }) => ({ slug, name })),
    gaps,
  };
}

export async function listTopics(db: SupabaseClient): Promise<{ slug: string; name: string; blurb: string; count: number }[]> {
  const [topics, projects] = await Promise.all([
    db.from('topics').select('slug, name, blurb').eq('tracked', true).order('name'),
    fetchAllRows<{ topics: string[] }>((a, b) => db.from('projects').select('topics').eq('listed', true).order('id').range(a, b)),
  ]);
  const count = new Map<string, number>();
  for (const p of projects) for (const t of p.topics ?? []) count.set(t, (count.get(t) ?? 0) + 1);
  return ((topics.data ?? []) as { slug: string; name: string; blurb: string }[]).map((t) => ({ ...t, count: count.get(t.slug) ?? 0 }));
}
