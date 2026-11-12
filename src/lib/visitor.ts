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
