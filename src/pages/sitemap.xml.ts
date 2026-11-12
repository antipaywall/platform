import type { APIRoute } from 'astro';
import { site } from '../config/site';
import { attempt, listIdeas } from '../lib/db';

const PAGES = ['/', '/about', '/join', '/join/build', '/join/panel', '/join/organize', '/ideas', '/pool', '/fund', '/sponsor', '/builders', '/rules', '/faq', '/privacy', '/terms'];

// The public pages, plus each listed idea. If ideas can't be read, the fixed pages are still listed.
export const GET: APIRoute = async () => {
  const ideas = (await attempt(() => listIdeas(1000))) ?? [];
  const paths = [...PAGES, ...ideas.map((i) => `/ideas/${i.slug}`)];
  const urls = paths.map((p) => `  <url><loc>${new URL(p, site.origin).href}</loc></url>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
};
