// Emails the organizer writes once and sends to the email list, or only to the builders on it.
// Only addresses on the list that have not unsubscribed ever get one, each with its own
// unsubscribe link and one-click header. Every delivered copy is recorded, so pressing send
// again (after a timeout, say) only reaches the people who have not had it yet.

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { site } from '../config/site';
import { type Email, oneClickUrl, resendBody, unsubscribeUrl } from './email';

export const AUDIENCES = {
  builders: 'Builders on the email list',
  list: 'Everyone on the email list',
} as const;
export type Audience = keyof typeof AUDIENCES;

/** Test copies go here and nowhere else. */
export const TEST_ADDRESS = 'e@ethanplus.ai';
export const MAX_SUBJECT = 150;
export const MAX_BODY = 20000;
/** Resend takes up to 100 emails in one batch call. */
const BATCH = 100;

export type Mailing = {
  id: string;
  subject: string;
  body: string;
  audience: Audience;
  createdAt: string;
  updatedAt: string;
  testedAt: string | null;
  sentAt: string | null;
};

export type Recipient = { id: string; email: string; token: string };

const COLUMNS = 'id, subject, body, audience, created_at, updated_at, tested_at, sent_at';
const toMailing = (r: any): Mailing => ({
  id: r.id, subject: r.subject, body: r.body, audience: r.audience, createdAt: r.created_at,
  updatedAt: r.updated_at, testedAt: r.tested_at, sentAt: r.sent_at,
});

/** What is wrong with a mailing before it is saved, or null when nothing is. */
export function checkMailing(input: { subject: string; body: string; audience: string }): string | null {
  if (!input.subject.trim() || input.subject.length > MAX_SUBJECT) return `Give it a subject, up to ${MAX_SUBJECT} characters.`;
  if (!input.body.trim() || input.body.length > MAX_BODY) return `Write the email, up to ${MAX_BODY.toLocaleString('en-US')} characters.`;
  if (!(input.audience in AUDIENCES)) return 'Pick who it goes to.';
  return null;
}

/** A test was sent after the last edit, so the organizer has seen this exact text in a mail app. */
export const testedSinceEdit = (m: Pick<Mailing, 'testedAt' | 'updatedAt'>) => Boolean(m.testedAt && Date.parse(m.testedAt) >= Date.parse(m.updatedAt));

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Escapes the text, then turns each https address in it into a link. */
const linked = (s: string) =>
  esc(s).replace(/https:\/\/[^\s<]+[^\s<.,;:!?)'"]/g, (url) => `<a href="${url}" style="color:#111">${url}</a>`);

/** Plain text as simple HTML: one paragraph per blank-line block, https addresses as links. */
export function textToHtml(text: string): string {
  const paras = text.trim().split(/\n{2,}/).map((p) => `<p style="margin:0 0 16px">${linked(p).replace(/\n/g, '<br>')}</p>`).join('\n');
  return `<div style="font:16px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111;max-width:600px">\n${paras}\n</div>`;
}

/** Why the reader is getting this, and how to stop. Added under every copy, the test included. */
export function footer(audience: Audience, url: string): string {
  const who = audience === 'builders' ? 'joined as a builder' : 'joined the email list';
  return `You're getting this because you ${who} on ${site.name}. To stop getting these emails, unsubscribe here:\n${url}`;
}

/** One copy of a mailing, for one address on the list. */
export function mailingEmail(m: Pick<Mailing, 'subject' | 'body' | 'audience'>, to: string, token: string): Email {
  const url = unsubscribeUrl(token);
  const text = `${m.body.trim()}\n\n--\n${footer(m.audience, url)}`;
  return { to, subject: m.subject.trim(), text, html: textToHtml(text), oneClickUrl: oneClickUrl(token) };
}

/** The test copy: same text, marked as a test, sent only to the organizer's own inbox. */
export function testEmail(m: Pick<Mailing, 'subject' | 'body' | 'audience'>): Email {
  const email = mailingEmail(m, TEST_ADDRESS, 'test-copy');
  // A test has no real unsubscribe link, so it carries no one-click header either.
  return { ...email, subject: `[Test] ${email.subject}`, oneClickUrl: undefined };
}

export async function listMailings(db: SupabaseClient): Promise<(Mailing & { sentCount: number })[]> {
  const { data, error } = await db.from('mailings').select(`${COLUMNS}, mailing_sends(count)`).order('created_at', { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({ ...toMailing(r), sentCount: r.mailing_sends?.[0]?.count ?? 0 }));
}

export async function getMailing(db: SupabaseClient, id: string): Promise<Mailing | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await db.from('mailings').select(COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toMailing(data) : null;
}

/** Everyone a mailing is for right now: on the list, not unsubscribed, and a builder if it says so. */
export async function recipients(db: SupabaseClient, audience: Audience): Promise<Recipient[]> {
  const { data, error } = await db.from('subscribers').select('id, email, token, person_id').is('unsubscribed_at', null).order('subscribed_at').limit(10000);
  if (error) throw new Error(error.message);
  let rows = (data ?? []) as { id: string; email: string; token: string; person_id: string | null }[];
  if (audience === 'builders') {
    const ids = [...new Set(rows.map((r) => r.person_id).filter((x): x is string => Boolean(x)))];
    const builders = new Set<string>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data: people, error: e } = await db.from('people').select('id').eq('is_builder', true).in('id', ids.slice(i, i + 200));
      if (e) throw new Error(e.message);
      for (const p of people ?? []) builders.add(p.id);
    }
    rows = rows.filter((r) => r.person_id && builders.has(r.person_id));
  }
  // One copy per address, even if the same address is on the list twice.
  const seen = new Set<string>();
  return rows
    .filter((r) => r.email && r.token && !seen.has(r.email.toLowerCase()) && seen.add(r.email.toLowerCase()))
    .map(({ id, email, token }) => ({ id, email, token }));
}

/** The ids of the list entries that already got this mailing. */
export async function alreadySent(db: SupabaseClient, mailingId: string): Promise<Set<string>> {
  const { data, error } = await db.from('mailing_sends').select('subscriber_id').eq('mailing_id', mailingId).limit(10000);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => r.subscriber_id as string));
}

export type SendOutcome = { sent: number; remaining: number; error: 'no_key' | 'refused' | 'unreachable' | 'not_saved' | null };

/**
 * Sends a mailing to everyone it is for who has not had it yet, up to 100 per call to Resend.
 * Stops at the first failure and says how many are left; running it again picks up from there.
 * The same batch always carries the same idempotency key, so a retry after a timeout that Resend
 * did in fact deliver is not sent twice.
 */
export async function sendMailing(
  db: SupabaseClient,
  m: Mailing,
  opts: { key?: string; fetchImpl?: typeof fetch } = {},
): Promise<SendOutcome> {
  const key = opts.key ?? (import.meta.env.RESEND_API_KEY as string | undefined);
  const done = await alreadySent(db, m.id);
  const todo = (await recipients(db, m.audience)).filter((r) => !done.has(r.id));
  if (!key) return { sent: 0, remaining: todo.length, error: 'no_key' };
  let sent = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const chunk = todo.slice(i, i + BATCH);
    const idem = `mailing-${m.id}-${createHash('sha256').update(chunk.map((r) => r.id).join(',')).digest('hex').slice(0, 32)}`;
    let ids: string[];
    try {
      const res = await (opts.fetchImpl ?? fetch)('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', 'idempotency-key': idem },
        body: JSON.stringify(chunk.map((r) => resendBody(mailingEmail(m, r.email, r.token)))),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) return { sent, remaining: todo.length - sent, error: 'refused' };
      const body = (await res.json().catch(() => null)) as { data?: { id?: unknown }[] } | null;
      ids = (body?.data ?? []).map((d) => (typeof d?.id === 'string' ? d.id : ''));
    } catch {
      return { sent, remaining: todo.length - sent, error: 'unreachable' };
    }
    const rows = chunk.map((r, j) => ({ mailing_id: m.id, subscriber_id: r.id, resend_id: ids[j] || null }));
    const { error } = await db.from('mailing_sends').upsert(rows, { onConflict: 'mailing_id,subscriber_id', ignoreDuplicates: true });
    sent += chunk.length;
    if (error) return { sent, remaining: todo.length - sent, error: 'not_saved' };
  }
  await db.from('mailings').update({ sent_at: new Date().toISOString() }).eq('id', m.id);
  return { sent, remaining: 0, error: null };
}
