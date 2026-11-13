import type { APIRoute } from 'astro';
import { findMatches } from '../../lib/match';
import { adminClient } from '../../lib/supabase';

// What already matches a wish while someone types it: gaps others posted, paid products, topics.
// Free: it runs in our own database. No sign-in needed, and nothing about the searcher is kept.
export const GET: APIRoute = async ({ url }) => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': status === 200 ? 'public, max-age=60, s-maxage=300' : 'no-store' } });
  const q = (url.searchParams.get('q') ?? '').slice(0, 200);
  const db = adminClient();
  if (!db || q.trim().length < 2) return json({ products: [], gaps: [], projects: [], topics: [] });
  try {
    return json(await findMatches(db, q, 6));
  } catch {
    return json({ products: [], gaps: [], projects: [], topics: [], unavailable: true }, 503);
  }
};
