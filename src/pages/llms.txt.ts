import type { APIRoute } from 'astro';
import { shape, site } from '../config/site';
import { OPEN_FILES } from '../lib/opendata';
import { listProducts, type ProductSummary } from '../lib/products';
import { ABOUT_SITE, categorySlug } from '../lib/seo';
import { adminClient } from '../lib/supabase';

// A plain summary of the site for AI tools and answer engines (llmstxt.org): what it is, where
// the useful pages are, and where the data can be read whole.
export const GET: APIRoute = async () => {
  const db = adminClient();
  const products: ProductSummary[] = db ? await listProducts(db).catch(() => []) : [];
  const url = (p: string) => new URL(p, site.origin).href;
  const categories = [...new Set(products.map((p) => p.category))].filter((c) => c !== 'Other').sort();
  const popular = [...products].sort((a, b) => b.signals - a.signals || b.freeOptions - a.freeOptions).filter((p) => p.freeOptions > 0).slice(0, 40);
  const lines = [
    `# ${site.name}`,
    '',
    `> ${ABOUT_SITE}`,
    '',
    `${site.name} lists ${products.length || 'hundreds of'} paid software tools and, for each one, the free, open-source projects on GitHub that do the same job, with their stars, license and how actively they are built. Where no good free version exists, the tool is a gap: people say what they would want, and the most wanted gaps become briefs for a community hackathon.`,
    '',
    `The hackathon: ${shape.summary} Entries are public repositories under an open-source license. ${shape.when}`,
    '',
    `The site and its catalog are open source: ${site.repo}`,
    '',
    '## Find a free alternative',
    '',
    `- [Every paid tool, by category](${url('/free-alternatives')}): the full list with free alternatives for each.`,
    `- [Search](${url('/search')}?q=notion): search by product name or by what you need it to do.`,
    `- [Look up a tool's website](${url('/find')}): paste a paid tool's address to see its free alternatives.`,
    ...categories.map((c) => `- [Free, open-source ${c.toLowerCase()} software](${url(`/free-alternatives/category/${categorySlug(c)}`)})`),
    '',
    '## Most asked-about tools',
    '',
    ...popular.map((p) => `- [Free, open-source alternatives to ${p.name}](${url(`/free-alternatives/${p.slug}`)}): ${p.freeOptions} listed.`),
    '',
    '## Build something',
    '',
    `- [The wall](${url('/wall')}): paid tools with no solid free version yet.`,
    `- [Ideas](${url('/ideas')}): what people want built, ranked by how many said me too.`,
    `- [The hackathon](${url('/hackathon')}): how it works, the rules and the prize pool.`,
    `- [Open Source Ready](${url('/open-source-ready')}): a guide to preparing a project for open source.`,
    '',
    '## Data and agents',
    '',
    ...OPEN_FILES.map((f) => `- [${f}.json](${url(`/open-data/${f}.json`)}): every public ${f === 'merges' ? 'idea merge' : f.replace(/s$/, '')} as JSON.`),
    `- [MCP server](${url('/agents')}): lets coding agents search the catalog and post ideas.`,
    '',
  ];
  return new Response(lines.join('\n'), { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400' } });
};
