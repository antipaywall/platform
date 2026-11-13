import type { APIRoute } from 'astro';
import { parseChartParams, starChartSvg } from '../../../lib/chart';
import { getStarPoints } from '../../../lib/projects';
import { adminClient } from '../../../lib/supabase';

// The star-history chart for a README. Cached for a day at the edge: it changes once a day.
export const GET: APIRoute = async ({ params, url }) => {
  const owner = String(params.owner ?? '');
  const repo = String(params.repo ?? '');
  if (!/^[\w.-]{1,100}$/.test(owner) || !/^[\w.-]{1,100}$/.test(repo)) return new Response(null, { status: 404 });
  const db = adminClient();
  if (!db) return new Response(null, { status: 503 });
  const found = await getStarPoints(db, owner, repo).catch(() => null);
  if (!found) return new Response(null, { status: 404 });
  const svg = starChartSvg(found.points, { ...parseChartParams(url), title: found.fullName });
  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=86400',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
};
