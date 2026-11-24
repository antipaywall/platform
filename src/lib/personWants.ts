// What a person wants, backs and saves: the part of a person page that works for someone who
// doesn't write code. Built from their signed-in signals and hearts.

import type { SupabaseClient } from '@supabase/supabase-js';
import { dollars } from './format';
import { monthlyCents, priceOf, type Price } from './products';

export type WantStatus = 'switched' | 'building' | 'wanted';
export const WANT_LABEL: Record<WantStatus, string> = { switched: 'Switched', building: 'Being built', wanted: 'Wanted' };

export function wantStatus(x: { kind: 'product'; use: boolean } | { kind: 'gap'; buildStatus: string; claims: number }): WantStatus {
  if (x.kind === 'product') return x.use ? 'switched' : 'wanted';
  return x.buildStatus === 'building' || x.buildStatus === 'exists' || x.claims > 0 ? 'building' : 'wanted';
}

/** What switching saves a month: the monthly price of each product they use a free version of. */
export const savedPerMonth = (prices: Price[]) => prices.reduce((sum, p) => sum + monthlyCents(p), 0);

export type PersonStats = { backed: number; payMonthCents: number; tested: number; savedMonthCents: number };
export type Want = { title: string; href: string; status: WantStatus; note: string };

type SignalRow = { subject_kind: string; subject_id: string; kind: string; pay_cents: number | null; pay_period: string | null };

const payNote = (r: SignalRow) => (r.pay_cents ? `Would pay ${dollars(r.pay_cents)}${r.pay_period === 'month' ? ' a month' : ' once'}` : '');

export async function personWants(db: SupabaseClient, userId: string): Promise<{ stats: PersonStats; wants: Want[] }> {
  const [sigs, hearts] = await Promise.all([
    db.from('signals').select('subject_kind, subject_id, kind, pay_cents, pay_period').eq('user_id', userId).limit(1000),
    db.from('idea_hearts').select('idea_id').eq('user_id', userId).limit(1000),
  ]);
  const rows = (sigs.data ?? []) as SignalRow[];
  const productIds = [...new Set(rows.filter((r) => r.subject_kind === 'product').map((r) => r.subject_id))];
  const gapIds = [...new Set([...rows.filter((r) => r.subject_kind === 'gap').map((r) => r.subject_id), ...((hearts.data ?? []) as { idea_id: string }[]).map((h) => h.idea_id)])];
  const [products, gaps, claims] = await Promise.all([
    productIds.length ? db.from('products').select('id, slug, name, price_cents, price_period').in('id', productIds) : Promise.resolve({ data: [] }),
    gapIds.length ? db.from('ideas').select('id, slug, title, build_status, status').in('id', gapIds).eq('status', 'listed') : Promise.resolve({ data: [] }),
    gapIds.length ? db.from('gap_claims').select('idea_id').in('idea_id', gapIds) : Promise.resolve({ data: [] }),
  ]);
  const claimCount = new Map<string, number>();
  for (const c of ((claims as any).data ?? []) as { idea_id: string }[]) claimCount.set(c.idea_id, (claimCount.get(c.idea_id) ?? 0) + 1);
  const mine = (kind: string, id: string) => rows.filter((r) => r.subject_kind === kind && r.subject_id === id);

  const wants: Want[] = [];
  const switchedPrices: Price[] = [];
  for (const p of ((products as any).data ?? []) as any[]) {
    const s = mine('product', p.id);
    const use = s.some((r) => r.kind === 'use');
    if (use) switchedPrices.push(priceOf(p));
    const note = [use ? 'Uses a free alternative' : s.some((r) => r.kind === 'switch') ? 'Would switch if it did more' : '', ...s.filter((r) => r.kind === 'pay').map(payNote)].filter(Boolean).join('. ');
    wants.push({ title: `Free ${p.name}`, href: `/free-alternatives/${p.slug}`, status: wantStatus({ kind: 'product', use }), note });
  }
  for (const g of ((gaps as any).data ?? []) as any[]) {
    const s = mine('gap', g.id);
    const n = claimCount.get(g.id) ?? 0;
    const note = [...s.filter((r) => r.kind === 'pay').map(payNote), s.some((r) => r.kind === 'test') ? 'Testing early builds' : '', n ? `${n} ${n === 1 ? 'builder' : 'builders'} on it` : ''].filter(Boolean).join('. ');
    wants.push({ title: g.title, href: `/ideas/${g.slug}`, status: wantStatus({ kind: 'gap', buildStatus: g.build_status, claims: n }), note });
  }
  return {
    stats: {
      backed: productIds.length + gapIds.length,
      payMonthCents: rows.filter((r) => r.kind === 'pay' && r.pay_period === 'month').reduce((a, r) => a + (r.pay_cents ?? 0), 0),
      tested: rows.filter((r) => r.kind === 'test').length,
      savedMonthCents: savedPerMonth(switchedPrices),
    },
    wants,
  };
}
