import type { APIRoute } from 'astro';
import { adminClient } from '../../lib/supabase';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// The way back onto the list, for someone holding their own unsubscribe link.
export const POST: APIRoute = async ({ request, redirect }) => {
  const token = String((await request.formData()).get('t') ?? '');
  const db = adminClient();
  if (!db || !UUID.test(token)) return redirect('/unsubscribe', 303);
  await db.rpc('resubscribe', { p_token: token });
  return redirect(`/unsubscribe?t=${token}`, 303);
};
