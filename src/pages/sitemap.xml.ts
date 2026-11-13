import type { APIRoute } from 'astro';
import { site } from '../config/site';
import { attempt, listBuilders, listIdeas } from '../lib/db';
import { profilePath } from '../lib/profiles';

const PAGES = ['/', '/about', '/join', '/join/build', '/join/panel', '/join/organize', '/ideas', '/pool', '/fund', '/sponsor', '/builders', '/rules', '/faq', '/privacy', '/terms'];

// The public pages, each listed idea and each builder's profile. If those can't be read, the fixed pages are still listed.
export const GET: APIRoute = async () => {
  const [ideas, builders] = await Promise.all([attempt(() => listIdeas(1000)), attempt(() => listBuilders(5000))]);
  const paths = [...PAGES, ...(ideas ?? []).map((i) => `/ideas/${i.slug}`), ...(builders ?? []).map((b) => profilePath(b.provider, b.handle))];
  const urls = paths.map((p) => `  <url><loc>${new URL(p, site.origin).href}</loc></url>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
};
