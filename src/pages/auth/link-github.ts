import type { APIRoute } from 'astro';
import { back, safeNext } from '../../lib/respond';
import { sessionClient } from '../../lib/supabase';

// A GitLab builder connects their GitHub account to prove a GitHub username is theirs.
// Needs "Allow manual linking" on in Supabase's Auth settings.
export const GET: APIRoute = async ({ request, cookies, url, redirect, locals }) => {
  const next = safeNext(url.searchParams.get('next'), '/');
  if (!locals.person) return back('/signin', 'need_signin');
  const supabase = sessionClient(request, cookies);
  if (!supabase) return back(next, 'signin_unavailable');
  const { data, error } = await supabase.auth.linkIdentity({
    provider: 'github',
    options: { redirectTo: `${url.origin}/auth/linked?next=${encodeURIComponent(next)}` },
  });
  if (error || !data?.url) return back(`/auth/username?next=${encodeURIComponent(next)}`, 'link_failed');
  return redirect(data.url);
};
