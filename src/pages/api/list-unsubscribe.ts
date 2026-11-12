import type { APIRoute } from 'astro';
import { adminClient } from '../../lib/supabase';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Where a mail app posts when someone presses its own "unsubscribe" button (RFC 8058).
// This is the one route another origin may post to: the token in the address is the proof,
// and all it can do is take that one address off the list. The answer is the same whether
// or not the token matched, so it cannot be used to test tokens.
export const POST: APIRoute = async ({ url }) => {
  const token = url.searchParams.get('t') ?? '';
  const db = adminClient();
  if (db && UUID.test(token)) await db.rpc('unsubscribe', { p_token: token });
  return new Response('If that link was valid, the address is off the list.\n', { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
};

// Opening the address in a browser changes nothing: it leads to the page with the confirm button.
export const GET: APIRoute = ({ url, redirect }) => {
  const token = url.searchParams.get('t') ?? '';
  return redirect(UUID.test(token) ? `/unsubscribe?t=${token}` : '/unsubscribe', 303);
};
