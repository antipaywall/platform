import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AstroCookies } from 'astro';

const URL_ = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.PUBLIC_SUPABASE_KEY as string | undefined;
const SECRET = import.meta.env.SUPABASE_SECRET_KEY as string | undefined;

/** True everywhere except a plain-http address on this machine, where a Secure cookie would never be sent back. */
export function needsSecure(requestUrl: string): boolean {
  const u = new URL(requestUrl);
  return !(u.protocol === 'http:' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname));
}

/** A client acting as the visitor. Used only for sign-in and reading their session. */
export function sessionClient(request: Request, cookies: AstroCookies): SupabaseClient | null {
  if (!URL_ || !KEY) return null;
  return createServerClient(URL_, KEY, {
    auth: { flowType: 'pkce' },
    cookies: {
      getAll: () =>
        parseCookieHeader(request.headers.get('cookie') ?? '').map((c) => ({ name: c.name, value: c.value ?? '' })),
      // The session cookies are for the server only: scripts on the page cannot read them,
      // and outside local development they are sent over https only.
      setAll: (list) => {
        for (const { name, value, options } of list) {
          cookies.set(name, value, { ...options, path: '/', httpOnly: true, sameSite: 'lax', secure: needsSecure(request.url) });
        }
      },
    },
  });
}

let admin: SupabaseClient | null = null;
/** The server's own client. It bypasses row-level security, so it never leaves the server. */
export function adminClient(): SupabaseClient | null {
  if (!URL_ || !SECRET) return null;
  admin ??= createClient(URL_, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}
