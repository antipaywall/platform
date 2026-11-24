import type { SupabaseClient } from '@supabase/supabase-js';
import type { AstroCookies } from 'astro';

const NAME = 'apw_visitor';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The random id this browser hearts with, if it has one. It identifies a browser, not a person. */
export function visitorId(cookies: AstroCookies): string | undefined {
  const v = cookies.get(NAME)?.value;
  return v && UUID.test(v) ? v : undefined;
}

/** Returns this browser's id, creating it on first use. Scripts on the page can't read it. */
export function ensureVisitorId(cookies: AstroCookies, secure: boolean): string {
  const existing = visitorId(cookies);
  if (existing) return existing;
  const id = crypto.randomUUID();
  cookies.set(NAME, id, { path: '/', httpOnly: true, sameSite: 'lax', secure, maxAge: 60 * 60 * 24 * 365 });
  return id;
}

/**
 * This browser's id, for anything that writes with it. A browser id is chosen by the browser, so
 * one that is also an account's id (account ids are public) is replaced with a fresh one: it must
 * never let a browser stand in for that account's hearts or signals.
 */
export async function safeVisitorId(db: SupabaseClient, cookies: AstroCookies, secure: boolean): Promise<string> {
  const id = ensureVisitorId(cookies, secure);
  const { data, error } = await db.from('people').select('id').eq('id', id).maybeSingle();
  if (!data && !error) return id;
  const fresh = crypto.randomUUID();
  cookies.set(NAME, fresh, { path: '/', httpOnly: true, sameSite: 'lax', secure, maxAge: 60 * 60 * 24 * 365 });
  return fresh;
}

/** Forgets this browser's id, so whoever uses the browser next starts afresh. Used on sign-out. */
export function clearVisitorId(cookies: AstroCookies): void {
  cookies.delete(NAME, { path: '/' });
}
