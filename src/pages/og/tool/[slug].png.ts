import type { APIRoute } from 'astro';
import { site } from '../../../config/site';
import { cardResponse, starsNote } from '../../../lib/ogCard';
import { getProductPage, productTitle } from '../../../lib/products';
import { adminClient } from '../../../lib/supabase';

// The share card for a paid tool's page.
export const GET: APIRoute = async ({ params }) => {
  const slug = String(params.slug ?? '').toLowerCase();
  if (!/^[a-z0-9-]{1,100}$/.test(slug)) return new Response(null, { status: 404 });
  const db = adminClient();
  if (!db) return new Response(null, { status: 503 });
  const page = await getProductPage(db, slug, { userId: null, personId: null, visitor: undefined }).catch(() => null);
  if (!page) return new Response(null, { status: 404 });
  const { product, projects } = page;
  const n = projects.length;
  return cardResponse(
    {
      headline: n ? `${n} free, open-source alternative${n === 1 ? '' : 's'} to ${product.name}` : productTitle(product.name),
      sub: n ? 'Compared side by side: stars, license and activity, straight from GitHub.' : 'Nobody has built one yet. Say what you would want, and builders take it on.',
      bricks: projects.slice(0, 7).map((p) => ({ label: p.name, note: starsNote(p.stars) })),
    },
    site.origin,
  );
};
