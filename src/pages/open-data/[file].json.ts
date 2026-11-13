import type { APIRoute } from 'astro';
import { OPEN_FILES, openData, type OpenFile } from '../../lib/opendata';
import { adminClient } from '../../lib/supabase';

// The open data, CC0. Cached for an hour at the edge.
export const GET: APIRoute = async ({ params }) => {
  const file = String(params.file ?? '') as OpenFile;
  if (!(OPEN_FILES as readonly string[]).includes(file)) return new Response(null, { status: 404 });
  const db = adminClient();
  if (!db) return new Response(null, { status: 503 });
  try {
    const items = await openData(db, file);
    return new Response(JSON.stringify({ license: 'CC0-1.0', source: 'https://www.antipaywall.org', generated_at: new Date().toISOString(), items }), {
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=600, s-maxage=3600', 'access-control-allow-origin': '*' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'unavailable' }), { status: 503, headers: { 'content-type': 'application/json', 'retry-after': '60' } });
  }
};
