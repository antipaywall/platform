import type { APIRoute } from 'astro';
import { parseProvider } from '../../lib/accounts';
import { back, safeNext } from '../../lib/respond';
import { sessionClient } from '../../lib/supabase';

export const GET: APIRoute = async ({ request, cookies, url, redirect }) => {
  const next = safeNext(url.searchParams.get('next'));
  // GitHub unless the link asks for GitLab. Anything else is refused, not guessed.
  const raw = url.searchParams.get('provider');
  const provider = raw === null ? 'github' : parseProvider(raw);
  if (!provider) return back(next, 'signin_failed');
  const supabase = sessionClient(request, cookies);
  if (!supabase) return back(next, 'signin_unavailable');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${url.origin}/auth/callback?provider=${provider}&next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) return back(next, 'signin_failed');
  return redirect(data.url);
};
