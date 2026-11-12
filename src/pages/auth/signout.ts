import type { APIRoute } from 'astro';
import { sessionClient } from '../../lib/supabase';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  await sessionClient(request, cookies)?.auth.signOut();
  return redirect('/');
};
