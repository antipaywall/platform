// Paid products and their pages: "Free, open-source alternatives to X".

import type { SupabaseClient } from '@supabase/supabase-js';
import { dollars } from './format';
import { demandFor } from './gaps';
import { fetchAllRows } from './sync/plan';
import { demandKey, signalsOf, type PayPeriod, type SignalKind } from './signals';

export type Price = { cents: number; period: 'month' | 'year' | 'once' } | null;

export const productTitle = (name: string) => `Free, open-source alternatives to ${name}`;

export function productDescription(name: string, count: number): string {
  const lead = count > 0 ? `${count} free, open-source alternatives to ${name}` : `Free, open-source alternatives to ${name}`;
  const full = `${lead}, pulled from GitHub, with what people say is still missing.`;
  return full.length <= 160 ? full : `${lead}, pulled from GitHub.`.slice(0, 160);
}

/** A price as a monthly amount, for "saved by switching". One-time prices don't count. */
export function monthlyCents(p: Price): number {
  if (!p) return 0;
  if (p.period === 'month') return p.cents;
  if (p.period === 'year') return Math.round(p.cents / 12);
  return 0;
}

/** List prices change, so the site always says "about". */
export function priceLabel(p: Price): string | null {
  if (!p) return null;
  return `about ${dollars(p.cents)} ${p.period === 'once' ? 'once' : `a ${p.period}`}`;
}

export const priceOf = (row: { price_cents: number | null; price_period: string | null }): Price =>
  row.price_cents != null && row.price_period ? { cents: row.price_cents, period: row.price_period as 'month' | 'year' | 'once' } : null;

export type ProductSummary = { id: string; slug: string; name: string; category: string; blurb: string; price: Price; freeOptions: number; signals: number };

/** Every product with how many free options are listed for it and how many signals it has. */
export async function listProducts(db: SupabaseClient): Promise<ProductSummary[]> {
  const [products, links, sigs] = await Promise.all([
    db.from('products').select('id, slug, name, category, blurb, price_cents, price_period').order('name'),
    fetchAllRows<{ product_id: string }>((a, b) => db.from('project_products').select('product_id, projects!inner(listed)').eq('projects.listed', true).order('product_id').order('project_id').range(a, b)),
    fetchAllRows<{ subject_id: string }>((a, b) => db.from('signals').select('subject_id').eq('subject_kind', 'product').order('id').range(a, b)),
  ]);
  if (products.error) throw new Error(products.error.message);
  const free = new Map<string, number>();
  for (const l of links) free.set(l.product_id, (free.get(l.product_id) ?? 0) + 1);
  const sig = new Map<string, number>();
  for (const s of sigs) sig.set(s.subject_id, (sig.get(s.subject_id) ?? 0) + 1);
  return (products.data ?? []).map((p: any) => ({
    id: p.id, slug: p.slug, name: p.name, category: p.category, blurb: p.blurb, price: priceOf(p),
    freeOptions: free.get(p.id) ?? 0, signals: sig.get(p.id) ?? 0,
  }));
}

export type ProjectCard = {
  id: string; fullName: string; name: string; url: string; description: string | null; stars: number;
  license: string | null; pushedAt: string | null; helpWanted: number; users: number; mineUse: boolean; handPicked: boolean;
  contributors: number | null;
};

export type ProductPage = {
  product: { id: string; slug: string; name: string; category: string; blurb: string; price: Price; topics: string[] };
  projects: ProjectCard[];
  missing: { id: string; slug: string; title: string; want: number; hearted: boolean }[];
  issues: { project: string; title: string; url: string; labels: string[]; comments: number }[];
  demand: { use: number; switch: number; pay: number; avgPayMonthCents: number | null };
  mine: Map<SignalKind, { payCents: number | null; payPeriod: PayPeriod | null }>;
  following: boolean;
  followers: number;
  syncedAt: string | null;
};

export async function getProductPage(
  db: SupabaseClient,
  slug: string,
  who: { userId: string | null; personId: string | null; visitor: string | undefined },
): Promise<ProductPage | null> {
  const { data: p, error } = await db.from('products').select('id, slug, name, category, blurb, price_cents, price_period, topics').eq('slug', slug).maybeSingle();
  if (error) throw new Error(error.message);
  if (!p) return null;

  const [links, gapLinks, demandRow, sync, follow, followers] = await Promise.all([
    db.from('project_products').select('source, projects!inner(id, full_name, name, url, description, stars, license_spdx, license_name, pushed_at, help_wanted, contributors, listed)').eq('product_id', p.id).eq('projects.listed', true).limit(500),
    db.from('gap_products').select('ideas!inner(id, slug, title, status, merged_into)').eq('product_id', p.id).eq('ideas.status', 'listed').is('ideas.merged_into', null),
    db.rpc('product_demand', { p_id: p.id }),
    db.from('sync_log').select('finished_at').eq('ok', true).order('finished_at', { ascending: false }).limit(1).maybeSingle(),
    who.personId ? db.from('follows').select('follower_id').eq('follower_id', who.personId).eq('subject_kind', 'tool').eq('subject_id', p.id).limit(1) : Promise.resolve({ data: [] }),
    db.from('follows').select('follower_id', { count: 'exact', head: true }).eq('subject_kind', 'tool').eq('subject_id', p.id),
  ]);

  const rows = ((links.data ?? []) as any[]).filter((l) => l.projects).map((l) => ({ ...l.projects, handPicked: l.source === 'catalog' }));
  const ids = rows.map((r) => r.id as string);
  const [useRows, mineProjects, mineProduct, issues] = await Promise.all([
    ids.length ? db.from('signals').select('subject_id, user_id, visitor').eq('subject_kind', 'project').eq('kind', 'use').in('subject_id', ids) : Promise.resolve({ data: [] }),
    signalsOf(db, { userId: who.userId ?? undefined, visitor: who.visitor }, 'project', ids),
    signalsOf(db, { userId: who.userId ?? undefined, visitor: who.visitor }, 'product', [p.id]),
    ids.length ? db.from('help_issues').select('project_id, title, url, labels, comments, updated_at').in('project_id', ids).order('updated_at', { ascending: false }).limit(9) : Promise.resolve({ data: [] }),
  ]);
  const users = new Map<string, Set<string>>();
  for (const u of ((useRows as any).data ?? []) as any[]) {
    const set = users.get(u.subject_id) ?? new Set();
    set.add(demandKey(u.user_id, u.visitor));
    users.set(u.subject_id, set);
  }
  const nameOf = new Map(rows.map((r) => [r.id, r.full_name as string]));
  const projects: ProjectCard[] = rows
    .map((r) => ({
      id: r.id, fullName: r.full_name, name: r.name, url: r.url, description: r.description, stars: r.stars,
      license: r.license_spdx ?? (r.license_name ? 'Own license' : null), pushedAt: r.pushed_at, helpWanted: r.help_wanted, users: users.get(r.id)?.size ?? 0,
      mineUse: mineProjects.get(r.id)?.has('use') ?? false, handPicked: Boolean(r.handPicked), contributors: r.contributors ?? null,
    }))
    // People who use it first, then the well-known alternatives from the catalog, then stars.
    .sort((a, b) => b.users - a.users || Number(b.handPicked) - Number(a.handPicked) || b.stars - a.stars)
    .slice(0, 30);

  const gaps = ((gapLinks.data ?? []) as any[]).map((g) => g.ideas).filter(Boolean);
  const gapDemand = await demandFor(db, gaps.map((g) => g.id));
  let hearted = new Set<string>();
  if (gaps.length && (who.visitor || who.userId)) {
    const h = await db.from('idea_hearts').select('idea_id').in('idea_id', gaps.map((g) => g.id)).or([who.visitor ? `visitor.eq.${who.visitor}` : '', who.userId ? `user_id.eq.${who.userId}` : ''].filter(Boolean).join(','));
    hearted = new Set((h.data ?? []).map((r: any) => r.idea_id));
  }
  const d: any = demandRow.data ?? {};

  return {
    product: { id: p.id, slug: p.slug, name: p.name, category: p.category, blurb: p.blurb, price: priceOf(p), topics: p.topics ?? [] },
    projects,
    missing: gaps
      .map((g) => ({ id: g.id, slug: g.slug, title: g.title, want: gapDemand.get(g.id)?.want ?? 0, hearted: hearted.has(g.id) }))
      .sort((a, b) => b.want - a.want),
    issues: ((issues as any).data ?? []).map((i: any) => ({ project: nameOf.get(i.project_id) ?? '', title: i.title, url: i.url, labels: i.labels ?? [], comments: i.comments })),
    demand: { use: Number(d.use ?? 0), switch: Number(d.switch ?? 0), pay: Number(d.pay ?? 0), avgPayMonthCents: d.avg_pay_cents_month != null ? Number(d.avg_pay_cents_month) : null },
    mine: mineProduct.get(p.id) ?? new Map(),
    following: (((follow as any).data ?? []) as unknown[]).length > 0,
    followers: followers.count ?? 0,
    syncedAt: (sync.data as any)?.finished_at ?? null,
  };
}
