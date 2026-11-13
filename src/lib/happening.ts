// "Happening now": what people and projects are doing on Antipaywall, newest first. New ideas,
// ideas being backed, would-pay signals (never money), builders joining, claiming and posting, and
// projects shipping updates on GitHub. Anyone not signed in shows as "Someone".

import type { SupabaseClient } from '@supabase/supabase-js';
import { dollars } from './format';

export type HappeningKind = 'idea' | 'backed' | 'signal' | 'switched' | 'joined' | 'claimed' | 'posted' | 'pushed';
export type Happening = { kind: HappeningKind; at: string; key: string; text: string; href: string; who?: string | null };

/** One list, newest first: one entry per key, and no kind more than half of it. */
export function mergeHappening(lists: Happening[][], limit: number): Happening[] {
  const seen = new Set<string>();
  const all = lists.flat().sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const cap = Math.max(1, Math.ceil(limit / 2));
  const perKind = new Map<HappeningKind, number>();
  const out: Happening[] = [];
  for (const h of all) {
    if (seen.has(h.key)) continue;
    if ((perKind.get(h.kind) ?? 0) >= cap) continue;
    seen.add(h.key);
    perKind.set(h.kind, (perKind.get(h.kind) ?? 0) + 1);
    out.push(h);
    if (out.length >= limit) break;
  }
  return out;
}

const quote = (s: string) => `“${s.length > 70 ? s.slice(0, 67) + '…' : s}”`;
const handle = (p: any) => p?.username ?? null;

export async function getHappening(db: SupabaseClient, limit = 12): Promise<Happening[]> {
  const [ideas, hearts, signals, joined, claims, posts, pushed] = await Promise.all([
    db.from('ideas').select('slug, title, created_at, people:author_id(username)').eq('status', 'listed').is('merged_into', null).order('created_at', { ascending: false }).limit(8),
    db.from('idea_hearts').select('created_at, user_id, ideas!inner(slug, title, status)').eq('ideas.status', 'listed').order('created_at', { ascending: false }).limit(10),
    db.from('signals').select('id, kind, pay_cents, pay_period, subject_kind, subject_id, created_at').in('kind', ['pay', 'use']).order('created_at', { ascending: false }).limit(10),
    db.from('people').select('username, joined_at').eq('is_builder', true).not('joined_at', 'is', null).order('joined_at', { ascending: false }).limit(6),
    db.from('gap_claims').select('created_at, people:person_id(username), ideas(slug, title)').order('created_at', { ascending: false }).limit(6),
    db.from('posts').select('id, body, created_at, people:person_id(username)').is('hidden_at', null).is('parent_id', null).order('created_at', { ascending: false }).limit(6),
    db.from('projects').select('full_name, pushed_at, stars').eq('listed', true).gte('stars', 1000).order('pushed_at', { ascending: false }).limit(12),
  ]);

  // Names for the products and gaps that signals point at.
  const sig = (signals.data ?? []) as any[];
  const productIds = sig.filter((s) => s.subject_kind === 'product').map((s) => s.subject_id);
  const gapIds = sig.filter((s) => s.subject_kind === 'gap').map((s) => s.subject_id);
  const [products, gaps] = await Promise.all([
    productIds.length ? db.from('products').select('id, slug, name').in('id', productIds) : Promise.resolve({ data: [] }),
    gapIds.length ? db.from('ideas').select('id, slug, title').in('id', gapIds) : Promise.resolve({ data: [] }),
  ]);
  const productBy = new Map(((products as any).data ?? []).map((p: any) => [p.id, p]));
  const gapBy = new Map(((gaps as any).data ?? []).map((g: any) => [g.id, g]));

  const lists: Happening[][] = [
    ((ideas.data ?? []) as any[]).map((i) => ({
      kind: 'idea', at: i.created_at, key: `idea:${i.slug}`, who: handle(i.people),
      text: handle(i.people) ? `@${handle(i.people)} wants ${quote(i.title)}` : `New idea: ${quote(i.title)}`, href: `/ideas/${i.slug}`,
    })),
    ((hearts.data ?? []) as any[]).map((h, n) => ({
      kind: 'backed', at: h.created_at, key: `heart:${h.ideas.slug}:${n}`, text: `Someone backed ${quote(h.ideas.title)}`, href: `/ideas/${h.ideas.slug}`,
    })),
    sig.flatMap((s): Happening[] => {
      const p: any = s.subject_kind === 'product' ? productBy.get(s.subject_id) : null;
      const g: any = s.subject_kind === 'gap' ? gapBy.get(s.subject_id) : null;
      if (s.kind === 'use' && p) return [{ kind: 'switched', at: s.created_at, key: `sig:${s.id}`, text: `Someone uses a free ${p.name} now`, href: `/free-alternatives/${p.slug}` }];
      if (s.kind === 'pay' && s.pay_cents) {
        const amount = `${dollars(s.pay_cents)}${s.pay_period === 'month' ? ' a month' : ' once'}`;
        if (p) return [{ kind: 'signal', at: s.created_at, key: `sig:${s.id}`, text: `Someone would pay ${amount} for a free ${p.name} that worked`, href: `/free-alternatives/${p.slug}` }];
        if (g) return [{ kind: 'signal', at: s.created_at, key: `sig:${s.id}`, text: `Someone would pay ${amount} for ${quote(g.title)}`, href: `/ideas/${g.slug}` }];
      }
      return [];
    }),
    ((joined.data ?? []) as any[]).filter((p) => p.username).map((p) => ({
      kind: 'joined', at: p.joined_at, key: `joined:${p.username}`, who: p.username, text: `@${p.username} joined Season 1`, href: `/builders/${p.username}`,
    })),
    ((claims.data ?? []) as any[]).filter((c) => c.ideas && handle(c.people)).map((c) => ({
      kind: 'claimed', at: c.created_at, key: `claim:${handle(c.people)}:${c.ideas.slug}`, who: handle(c.people),
      text: `@${handle(c.people)} started building ${quote(c.ideas.title)}`, href: `/ideas/${c.ideas.slug}`,
    })),
    ((posts.data ?? []) as any[]).filter((p) => handle(p.people)).map((p) => ({
      kind: 'posted', at: p.created_at, key: `post:${p.id}`, who: handle(p.people), text: `@${handle(p.people)}: ${quote(String(p.body ?? ''))}`, href: '/feed',
    })),
    // Projects push code all day; a few of those are news, more would drown out the people.
    ((pushed.data ?? []) as any[]).filter((p) => p.pushed_at).slice(0, 3).map((p) => ({
      kind: 'pushed', at: p.pushed_at, key: `push:${p.full_name}`, text: `${p.full_name} shipped an update`, href: `/projects/${p.full_name}`,
    })),
  ] as Happening[][];
  return mergeHappening(lists, limit);
}
