import type { APIRoute } from 'astro';
import { sessionClient } from '../../lib/supabase';
import { clearVisitorId } from '../../lib/visitor';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  await sessionClient(request, cookies)?.auth.signOut();
  // The browser's id goes too: the next person here must not see this person's signals or hearts.
  clearVisitorId(cookies);
  return redirect('/');
};
