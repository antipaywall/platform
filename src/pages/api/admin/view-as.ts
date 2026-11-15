import type { APIRoute } from 'astro';
import { isAdmin } from '../../../lib/db';
import { safeBack } from '../../../lib/respond';
import { needsSecure } from '../../../lib/supabase';
import { parseViewAs, VIEW_COOKIE } from '../../../lib/viewAs';

// Switches what the organizer sees: the site as a regular member, as a builder, or as themself.
// Organizer only. It sets a cookie that the middleware honours for the organizer and nobody else.
export const POST: APIRoute = async ({ request, locals, cookies, redirect }) => {
  if (!isAdmin(locals.person)) return new Response(null, { status: 404 });
  const form = await request.formData();
  const view = parseViewAs(form.get('as'));
  if (view) cookies.set(VIEW_COOKIE, view, { path: '/', httpOnly: true, sameSite: 'lax', secure: needsSecure(request.url), maxAge: 60 * 60 * 12 });
  else cookies.delete(VIEW_COOKIE, { path: '/' });
  return redirect(safeBack(form.get('next'), '/account'), 303);
};
