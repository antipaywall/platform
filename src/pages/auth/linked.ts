import type { APIRoute } from 'astro';
import { back, safeNext } from '../../lib/respond';
import { adminClient, sessionClient } from '../../lib/supabase';
import { assignUsername } from '../../lib/usernames';

// Back from connecting GitHub: the GitHub login on the linked identity is verified by GitHub, so
// the builder may take it as their username.
export const GET: APIRoute = async ({ request, cookies, url }) => {
  const next = safeNext(url.searchParams.get('next'), '/');
  const retry = `/auth/username?next=${encodeURIComponent(next)}`;
  const supabase = sessionClient(request, cookies);
  const db = adminClient();
  const code = url.searchParams.get('code');
  if (!supabase || !db || !code) return back(retry, 'link_failed');
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) return back(retry, 'link_failed');
  const identity = (data.session.user.identities ?? []).find((i) => i.provider === 'github');
  const login = identity?.identity_data?.user_name;
  if (typeof login !== 'string' || !login) return back(retry, 'link_failed');
  const { data: person } = await db.from('people').select('id, provider, handle, username').eq('id', data.session.user.id).maybeSingle();
  if (!person) return back(retry, 'link_failed');
  await db.from('people').update({ github_login: login }).eq('id', person.id);
  const decided = await assignUsername(db, { id: person.id, provider: person.provider === 'gitlab' ? 'gitlab' : 'github', handle: person.handle, githubLogin: login, current: person.username });
  return 'username' in decided ? back(next, 'username_saved') : back(retry, 'username_taken');
};
