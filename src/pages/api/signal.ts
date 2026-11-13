import type { APIRoute } from 'astro';
import { back } from '../../lib/respond';
import { senderKey } from '../../lib/requester';
import { takeSlot } from '../../lib/ratelimit';
import { parseSignal, toggleSignal } from '../../lib/signals';
import { adminClient } from '../../lib/supabase';
import { ensureVisitorId } from '../../lib/visitor';

/** Signals one connection may give in an hour. Generous: pressing a few buttons is normal. */
const MAX_SIGNALS_PER_HOUR = 120;

// Give or take back a signal. No sign-in needed. Works as a plain form post (redirects back)
// and from the page's script (answers with JSON), so the buttons work without scripts too.
export const POST: APIRoute = async (context) => {
  const { request, cookies, url, locals } = context;
  const form = await request.formData();
  const wantsJson = (request.headers.get('accept') ?? '').includes('application/json');
  const nextRaw = String(form.get('next') ?? '/');
  const next = nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/';
  const reply = (ok: boolean, code: Parameters<typeof back>[1]) =>
    wantsJson ? Response.json({ ok, code }, { status: ok ? 200 : 400 }) : back(next, code);

  const parsed = parseSignal(form);
  if (!parsed.ok) return reply(false, parsed.code);
  const db = adminClient();
  if (!db) return reply(false, 'save_failed');
  const sender = senderKey(context);
  if (sender && (await takeSlot(db, 'signal', sender, MAX_SIGNALS_PER_HOUR)) === 'limited') return reply(false, 'too_many');

  const visitor = ensureVisitorId(cookies, url.protocol === 'https:');
  try {
    await toggleSignal(db, parsed, { userId: locals.userId, visitor });
  } catch {
    return reply(false, 'save_failed');
  }
  return reply(true, 'signal_saved');
};
