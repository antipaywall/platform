import type { APIRoute } from 'astro';
import { matchAsked } from '../../lib/askedTools';
import { findMatches, queryWords } from '../../lib/match';
import { parseDomain } from '../../lib/siteReader';
import { adminClient } from '../../lib/supabase';

// What already matches a wish while someone types it: gaps others posted, paid products, topics.
// Free: it runs in our own database. No sign-in needed, and nothing about the searcher is kept.
export const GET: APIRoute = async ({ url }) => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': status === 200 ? 'public, max-age=60, s-maxage=300' : 'no-store' } });
  const q = (url.searchParams.get('q') ?? '').slice(0, 200);
  const db = adminClient();
  if (!db || q.trim().length < 2) return json({ products: [], gaps: [], projects: [], topics: [] });
  try {
    // A pasted website is offered as a lookup; tools others already looked up are matched by name or by what they do.
    const [matches, asked] = await Promise.all([findMatches(db, q, 6), matchAsked(db, q.trim(), queryWords(q))]);
    return json({ ...matches, asked, site: parseDomain(q) });
  } catch {
    return json({ products: [], gaps: [], projects: [], topics: [], unavailable: true }, 503);
  }
};
