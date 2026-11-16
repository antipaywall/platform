// Re-judges every link already in the database by today's rule (src/lib/sync/link.ts and
// catalog/links.yml), without searching GitHub. Use it after the rule changes, so the site stops
// showing links the new rule would never make. It only removes links; it adds nothing.
//
//   SUPABASE_URL=… SUPABASE_SECRET_KEY=… npx tsx scripts/recheck-links.ts           (prints what it would remove)
//   SUPABASE_URL=… SUPABASE_SECRET_KEY=… npx tsx scripts/recheck-links.ts --apply   (removes them)

import { createClient } from '@supabase/supabase-js';
import { loadCatalog } from '../src/lib/catalog';
import { linkSource, type FoundBy } from '../src/lib/sync/link';
import type { RepoFacts } from '../src/lib/sync/filter';
import { fetchAllRows } from '../src/lib/sync/plan';

const APPLY = process.argv.includes('--apply');

type Row = { project_id: string; product_id: string; source: string; projects: { full_name: string; description: string | null; topics: string[] | null; stars: number; listed: boolean }; products: { slug: string } };

async function main() {
  const db = createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SECRET_KEY ?? '', { auth: { persistSession: false } });
  const catalog = loadCatalog();
  const bySlug = new Map(catalog.products.map((p) => [p.slug, p]));
  const hand = new Set(catalog.links.filter((l) => l.action === 'add').map((l) => `${l.product}|${l.project.toLowerCase()}`));
  const handRemoved = new Set(catalog.links.filter((l) => l.action === 'remove').map((l) => `${l.product}|${l.project.toLowerCase()}`));

  const rows = await fetchAllRows<Row>((a, b) =>
    db.from('project_products').select('project_id, product_id, source, projects!inner(full_name, description, topics, stars, listed), products!inner(slug)').order('product_id').order('project_id').range(a, b) as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
  );

  const drop: Row[] = [];
  for (const r of rows) {
    const slug = r.products.slug;
    const key = `${slug}|${r.projects.full_name.toLowerCase()}`;
    if (handRemoved.has(key)) { drop.push(r); continue; }
    if (r.source === 'catalog') { if (!hand.has(key)) drop.push(r); continue; }
    // A link the new rule refuses, unless a person picked the same pair by hand.
    if (hand.has(key)) continue;
    const p = bySlug.get(slug);
    const facts = { fullName: r.projects.full_name, description: r.projects.description, topics: r.projects.topics ?? [] } as RepoFacts;
    if (!p || linkSource(facts, p, [r.source as FoundBy]) === null) drop.push(r);
  }

  const bySource = (list: Row[]) => list.reduce<Record<string, number>>((m, r) => ({ ...m, [r.source]: (m[r.source] ?? 0) + 1 }), {});
  console.log(`${rows.length} links now, by source:`, bySource(rows));
  console.log(`${drop.length} would be removed, by source:`, bySource(drop));
  console.log(`${rows.length - drop.length} would stay`);

  // What the wall would show afterwards, among listed repos.
  const keep = new Set(rows.map((r) => `${r.product_id}|${r.project_id}`));
  for (const r of drop) keep.delete(`${r.product_id}|${r.project_id}`);
  const best = new Map<string, number>();
  for (const r of rows) if (keep.has(`${r.product_id}|${r.project_id}`) && r.projects.listed) best.set(r.product_id, Math.max(best.get(r.product_id) ?? 0, r.projects.stars));
  const total = catalog.products.length;
  const solid = [...best.values()].filter((s) => s >= 1000).length;
  const some = [...best.values()].filter((s) => s < 1000).length;
  console.log(`Wall afterwards: ${solid} solid, ${some} early, ${total - solid - some} with nothing free (of ${total})`);

  const sample = (slug: string) => drop.filter((r) => r.products.slug === slug).map((r) => r.projects.full_name);
  for (const s of ['lovable', 'notion', 'calendly', 'monday', 'salesforce']) console.log(`  ${s} loses:`, sample(s).slice(0, 12).join(', ') || 'nothing');

  if (!APPLY) return console.log('Dry run: nothing removed. Pass --apply to remove them.');
  let removed = 0;
  for (const r of drop) {
    const { error } = await db.from('project_products').delete().eq('project_id', r.project_id).eq('product_id', r.product_id);
    if (error) throw new Error(error.message);
    removed++;
  }
  await db.from('sync_log').insert({ kind: 'github', finished_at: new Date().toISOString(), ok: true, note: `recheck: removed ${removed} links the evidence rule refuses` });
  console.log(`Removed ${removed} links.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
