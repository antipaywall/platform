import type { APIRoute } from 'astro';
import { site } from '../../../../config/site';
import { listWords } from '../../../../lib/seo';
import { cardResponse, starsNote } from '../../../../lib/ogCard';
import { getProjectPage } from '../../../../lib/projects';
import { adminClient } from '../../../../lib/supabase';

// The share card for an open-source project's page.
export const GET: APIRoute = async ({ params }) => {
  const owner = String(params.owner ?? '');
  const repo = String(params.repo ?? '');
  if (!/^[\w.-]{1,100}$/.test(owner) || !/^[\w.-]{1,100}$/.test(repo)) return new Response(null, { status: 404 });
  const db = adminClient();
  if (!db) return new Response(null, { status: 503 });
  const page = await getProjectPage(db, owner, repo, { userId: null, personId: null, visitor: undefined }).catch(() => null);
  if (!page) return new Response(null, { status: 404 });
  const { project: p, products, similar } = page;
  const replaces = products.map((x) => x.name);
  return cardResponse(
    {
      headline: replaces.length ? `${p.name}: a free alternative to ${listWords(replaces.slice(0, 2))}` : p.name,
      sub: `${starsNote(p.stars)} on GitHub${p.licenseSpdx ? `, ${p.licenseSpdx} license` : ''}. Open source, free to run and change.`,
      bricks: [{ label: p.name, note: starsNote(p.stars) }, ...similar.slice(0, 5).map((s) => ({ label: s.fullName.split('/')[1], note: starsNote(s.stars) }))],
    },
    site.origin,
  );
};
