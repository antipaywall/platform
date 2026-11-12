import type { APIRoute } from 'astro';
import { back, safeNext } from '../../lib/respond';
import { sessionClient } from '../../lib/supabase';

export const GET: APIRoute = async ({ request, cookies, url, redirect }) => {
  const next = safeNext(url.searchParams.get('next'));
  const supabase = sessionClient(request, cookies);
  if (!supabase) return back(next, 'signin_unavailable');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: `${url.origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) return back(next, 'signin_failed');
  return redirect(data.url);
};
