// Signals: where someone stands on a paid product, a project or a gap. Anyone can give one, no
// sign-in needed: it is keyed by the browser's random id, like a heart, and becomes the person's
// own when they sign in. A signal is never money. "Would pay" is what someone says they would
// pay if it worked, and every page that shows one says so.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MessageCode } from './respond';

export type SubjectKind = 'product' | 'project' | 'gap';
export type SignalKind = 'use' | 'switch' | 'pay' | 'test';
export type PayPeriod = 'month' | 'once';

/** The amounts someone can pick, in cents. Fixed choices keep the totals honest and the form simple. */
export const PAY_CHOICES: Record<PayPeriod, readonly number[]> = {
  month: [300, 500, 1000, 2000, 5000],
  once: [500, 1000, 2500, 5000, 10000],
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KINDS: readonly SignalKind[] = ['use', 'switch', 'pay', 'test'];
const SUBJECTS: readonly SubjectKind[] = ['product', 'project', 'gap'];

export type ParsedSignal = {
  subjectKind: SubjectKind;
  subjectId: string;
  kind: SignalKind;
  on: boolean;
  payCents: number | null;
  payPeriod: PayPeriod | null;
};

export function parseSignal(form: FormData): ({ ok: true } & ParsedSignal) | { ok: false; code: MessageCode } {
  const subjectKind = String(form.get('subject_kind') ?? '') as SubjectKind;
  const subjectId = String(form.get('subject_id') ?? '');
  const kind = String(form.get('kind') ?? '') as SignalKind;
  const on = form.get('on') === '1';
  if (!SUBJECTS.includes(subjectKind) || !UUID.test(subjectId) || !KINDS.includes(kind)) return { ok: false, code: 'save_failed' };
  let payCents: number | null = null;
  let payPeriod: PayPeriod | null = null;
  if (kind === 'pay' && on) {
    const m = /^(month|once):(\d{1,6})$/.exec(String(form.get('pay') ?? ''));
    if (!m) return { ok: false, code: 'bad_pay' };
    payPeriod = m[1] as PayPeriod;
    payCents = Number(m[2]);
    if (!PAY_CHOICES[payPeriod].includes(payCents)) return { ok: false, code: 'bad_pay' };
  }
  return { ok: true, subjectKind, subjectId, kind, on, payCents, payPeriod };
}

/** Who a signal counts as: the person when signed in, otherwise the browser. */
export const demandKey = (userId: string | null, visitor: string) => (userId ? `u:${userId}` : `v:${visitor}`);

export type Who = { userId: string | null; visitor: string };

/** Sets or clears one signal. Setting replaces any earlier one of the same kind (a new amount, say). */
export async function toggleSignal(db: SupabaseClient, s: ParsedSignal, who: Who): Promise<void> {
  let del = db.from('signals').delete().eq('subject_kind', s.subjectKind).eq('subject_id', s.subjectId).eq('kind', s.kind);
  del = who.userId ? del.eq('user_id', who.userId) : del.eq('visitor', who.visitor).is('user_id', null);
  const cleared = await del;
  if (cleared.error) throw new Error(cleared.error.message);
  if (!s.on) return;
  const made = await db.from('signals').insert({
    subject_kind: s.subjectKind, subject_id: s.subjectId, kind: s.kind,
    pay_cents: s.payCents, pay_period: s.payPeriod, user_id: who.userId, visitor: who.visitor,
  });
  if (made.error) throw new Error(made.error.message);
}

/** Which signals this person or browser has given, for each subject id. */
export async function signalsOf(db: SupabaseClient, who: Partial<Who>, subjectKind: SubjectKind, ids: string[]): Promise<Map<string, Map<SignalKind, { payCents: number | null; payPeriod: PayPeriod | null }>>> {
  const out = new Map<string, Map<SignalKind, { payCents: number | null; payPeriod: PayPeriod | null }>>();
  if (!ids.length || (!who.userId && !who.visitor)) return out;
  let q = db.from('signals').select('subject_id, kind, pay_cents, pay_period').eq('subject_kind', subjectKind).in('subject_id', ids);
  q = who.userId ? q.eq('user_id', who.userId) : q.eq('visitor', who.visitor!).is('user_id', null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  for (const r of data ?? []) {
    const m = out.get(r.subject_id) ?? new Map();
    m.set(r.kind as SignalKind, { payCents: r.pay_cents, payPeriod: r.pay_period });
    out.set(r.subject_id, m);
  }
  return out;
}

/** Someone who has backed anything while signed in: a signal or a heart. */
export async function isBacker(db: SupabaseClient, userId: string): Promise<boolean> {
  const [s, h] = await Promise.all([
    db.from('signals').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    db.from('idea_hearts').select('idea_id', { count: 'exact', head: true }).eq('user_id', userId),
  ]);
  return (s.count ?? 0) + (h.count ?? 0) > 0;
}

/** Moves this browser's signals and hearts to the person who just signed in. Never blocks sign-in. */
export async function claimSignals(db: SupabaseClient, visitor: string | undefined, userId: string): Promise<void> {
  if (!visitor) return;
  await db.rpc('claim_signals', { p_visitor: visitor, p_user: userId }).then(() => undefined, () => undefined);
}

/** Dollars, for a would-pay amount. Whole dollars when it is whole. */
export const payLabel = (cents: number, period: PayPeriod | 'month' | null) =>
  `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: cents % 100 ? 2 : 0 })}${period === 'month' ? '/mo' : period === 'once' ? ' once' : ''}`;
