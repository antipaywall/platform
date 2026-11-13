import type { APIRoute } from 'astro';
import { site } from '../config/site';
import { attempt, listBuilders } from '../lib/db';
import { sitemapData, sitemapPaths } from '../lib/opendata';
import { profilePath } from '../lib/profiles';
import { adminClient } from '../lib/supabase';

// The public pages: paid products, tracked topics, projects open to search engines, gaps that
// aren't merged into another, and builders' profiles. If the database can't be read, the fixed
// pages are still listed.
export const GET: APIRoute = async () => {
  const db = adminClient();
  const [data, builders] = await Promise.all([
    db ? sitemapData(db).catch(() => null) : Promise.resolve(null),
    attempt(() => listBuilders(5000)),
  ]);
  const paths = [
    ...sitemapPaths(data ?? { products: [], topics: [], projects: [], gaps: [] }),
    ...(builders ?? []).map((b) => profilePath(b.provider, b.handle)),
  ];
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const urls = [...new Set(paths)].map((p) => `  <url><loc>${esc(new URL(p, site.origin).href)}</loc></url>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
};
