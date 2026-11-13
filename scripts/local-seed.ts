// Fills a local Antipaywall database from the public open data, so anyone can run the whole
// platform on their own machine. Nothing private is needed: no keys from the live site.
//
//   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SECRET_KEY=<local service key> pnpm local:seed
//   pnpm local:seed --base https://www.antipaywall.org      (the default)
//
// Refuses to write anywhere but a local address, so it can never touch the live database.

import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const BASE = args[args.indexOf('--base') + 1] && args.includes('--base') ? args[args.indexOf('--base') + 1] : 'https://www.antipaywall.org';

async function open(file: string): Promise<any[]> {
  const res = await fetch(`${BASE}/open-data/${file}.json`);
  if (!res.ok) throw new Error(`Could not read ${BASE}/open-data/${file}.json (${res.status})`);
  return ((await res.json()) as { items: any[] }).items;
}

async function main() {
  const url = process.env.SUPABASE_URL ?? '';
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url)) throw new Error('SUPABASE_URL must be your local Supabase (http://127.0.0.1:54321). This script never writes anywhere else.');
  const db = createClient(url, process.env.SUPABASE_SECRET_KEY ?? '', { auth: { persistSession: false } });
  const [products, topics, projects, gaps] = await Promise.all([open('products'), open('topics'), open('projects'), open('gaps')]);

  const check = (r: { error: { message: string } | null }, what: string) => {
    if (r.error) throw new Error(`${what}: ${r.error.message}`);
  };
  check(await db.from('products').upsert(products, { onConflict: 'slug' }), 'products');
  check(await db.from('topics').upsert(topics, { onConflict: 'slug' }), 'topics');

  const productId = new Map(((await db.from('products').select('id, slug')).data ?? []).map((p) => [p.slug, p.id]));
  let i = 0;
  for (const chunk of Array.from({ length: Math.ceil(projects.length / 200) }, (_, n) => projects.slice(n * 200, n * 200 + 200))) {
    const rows = chunk.map((p: any, n: number) => ({
      github_id: -(i + n + 1), // The open data has no GitHub ids; the next real sync replaces these rows.
      full_name: p.full_name, owner: p.full_name.split('/')[0], name: p.full_name.split('/')[1], url: p.url,
      description: p.description, homepage: p.homepage, topics: p.topics ?? [], license_spdx: p.license_spdx, stars: p.stars, forks: p.forks,
      open_issues: p.open_issues, help_wanted: p.help_wanted, good_first: p.good_first, contributors: p.contributors, pushed_at: p.pushed_at,
      created_on_github: p.created_on_github, latest_release_tag: p.latest_release_tag, listed: true, indexable: true,
    }));
    i += chunk.length;
    const saved = await db.from('projects').upsert(rows, { onConflict: 'github_id' }).select('id, full_name');
    check(saved, 'projects');
    const byName = new Map((saved.data ?? []).map((s) => [s.full_name, s.id]));
    const links = chunk.flatMap((p: any) => (p.products ?? []).filter((l: any) => productId.has(l.slug) && byName.has(p.full_name)).map((l: any) => ({ project_id: byName.get(p.full_name), product_id: productId.get(l.slug), source: l.source })));
    if (links.length) check(await db.from('project_products').upsert(links, { onConflict: 'project_id,product_id' }), 'links');
  }

  for (const g of gaps.filter((x: any) => !x.merged_into_slug)) {
    check(await db.from('ideas').upsert({ slug: g.slug, title: g.title, pitch: g.pitch ?? '', missing: g.missing ?? '', build_status: g.build_status, words: g.words ?? [], status: 'listed', author_id: null }, { onConflict: 'slug' }), `gap ${g.slug}`);
  }
  console.log(`Seeded ${products.length} paid products, ${topics.length} topics, ${projects.length} projects and ${gaps.length} gaps from ${BASE}.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
