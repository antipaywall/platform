import type { APIRoute } from 'astro';
import { GithubUnavailableError, searchRepos, type RepoHit } from '../../lib/github';

// Signed-in visitors only, and a modest per-person pace, so the search can't be used
// to burn through GitHub's limit. Both the cache and the pacing are per server instance.
const cache = new Map<string, { at: number; hits: RepoHit[] }>();
const recent = new Map<string, number[]>();
const PER_MINUTE = 12;

export const GET: APIRoute = async ({ url, locals }) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  const person = locals.userId ? { id: locals.userId } : null;
  if (!person) return json({ hits: [], signin: true }, 401);

  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase().slice(0, 120);
  if (q.length < 3) return json({ hits: [] });
  const hit = cache.get(q);
  if (hit && Date.now() - hit.at < 10 * 60_000) return json({ hits: hit.hits });

  const now = Date.now();
  const mine = (recent.get(person.id) ?? []).filter((t) => now - t < 60_000);
  if (mine.length >= PER_MINUTE) return json({ hits: [], unavailable: true }, 429);
  recent.set(person.id, [...mine, now]);

  try {
    const hits = await searchRepos(q);
    if (cache.size > 500) cache.clear();
    cache.set(q, { at: now, hits });
    return json({ hits });
  } catch (e) {
    if (e instanceof GithubUnavailableError) return json({ hits: [], unavailable: true });
    throw e;
  }
};
