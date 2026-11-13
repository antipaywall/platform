// The daily sync: copies the catalog into the database, finds each paid product's open-source
// alternatives on GitHub, reads their details 50 at a time, keeps their help-wanted issues and
// a sampled star history, and records what it did in sync_log.
//
// Anyone can run it against their own Supabase:
//   SUPABASE_URL=… SUPABASE_SECRET_KEY=… GITHUB_TOKEN=… pnpm sync
//   pnpm sync --dry-run          (reads GitHub, writes nothing, prints counts)
// Production runs it daily in GitHub Actions (.github/workflows/sync.yml).
//
// It never spends GitHub's whole allowance: when only a reserve is left it stops, records
// "rate limit", and the next run carries on.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadCatalog, type Product } from '../src/lib/catalog';
import { passesFilter, type RepoFacts } from '../src/lib/sync/filter';
import { factsFromSearchItem, fetchReposResilient, GithubBudget, isIndexable, RateLimited, searchQueries, type HelpIssue, type SearchItem } from '../src/lib/sync/github';
import { linkSource, type FoundBy } from '../src/lib/sync/link';
import { fetchAllRows, relinkable, toUnlist } from '../src/lib/sync/plan';

const DRY = process.argv.includes('--dry-run');
const TOKEN = process.env.GITHUB_TOKEN ?? '';
const SEARCH_PER_QUERY = 50;
/** At most this many projects per paid product, most-starred first. */
const MAX_PER_PRODUCT = 40;
const CONTRIBUTOR_REFRESH_DAYS = 7;
const DAY = 24 * 3600 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const core = new GithubBudget(100);
const search = new GithubBudget(2);
const graph = new GithubBudget(100);
const headers = (accept = 'application/vnd.github+json') => ({ accept, authorization: `Bearer ${TOKEN}`, 'user-agent': 'antipaywall-sync' });

async function gh(url: string, accept?: string, budget = core): Promise<Response> {
  budget.check();
  const res = await fetch(url, { headers: headers(accept) });
  budget.update(res.headers);
  if (res.status === 403 || res.status === 429) {
    if (res.headers.get('x-ratelimit-remaining') === '0' || res.status === 429) throw new RateLimited(`GitHub answered ${res.status}`);
  }
  return res;
}

function must<T>(r: { data: T; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
}

async function upsertCatalog(db: SupabaseClient, products: Product[], topics: { slug: string; name: string; blurb: string }[]) {
  const rows = products.map((p) => ({
    slug: p.slug, name: p.name, category: p.category, price_cents: p.price?.cents ?? null, price_period: p.price?.period ?? null,
    words: p.words, topics: p.topics, search_terms: p.search_terms, aliases: p.aliases, excludes: p.excludes, blurb: p.blurb,
    updated_at: new Date().toISOString(),
  }));
  must(await db.from('products').upsert(rows, { onConflict: 'slug' }), 'products');
  must(await db.from('topics').upsert(topics.map((t) => ({ ...t, tracked: true })), { onConflict: 'slug' }), 'topics');
}

async function findCandidates(products: Product[]): Promise<{ found: Map<string, Map<string, Set<FoundBy>>>; failed: Set<string>; seen: Map<string, RepoFacts> }> {
  // What each search result already says about a repo, so junk is dropped without more requests.
  const seen = new Map<string, RepoFacts>();
  // product slug → repo full name → how it was found
  const found = new Map<string, Map<string, Set<FoundBy>>>();
  // Products with a search that didn't answer: their existing links are left alone this run.
  const failed = new Set<string>();
  const tagged = new Set<string>();
  const runSearch = async (q: string): Promise<string[] | null> => {
    const res = await gh(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${SEARCH_PER_QUERY}`, undefined, search);
    await sleep(2200); // 30 searches a minute
    if (!res.ok) return null;
    const body = (await res.json()) as { items?: SearchItem[] };
    const names: string[] = [];
    for (const item of body.items ?? []) {
      const f = factsFromSearchItem(item);
      if (!f) continue;
      seen.set(f.fullName.toLowerCase(), f);
      names.push(f.fullName);
    }
    return names;
  };
  for (const p of products) {
    const byRepo = new Map<string, Set<FoundBy>>();
    for (const q of searchQueries(p)) {
      const how: FoundBy = q.startsWith(`topic:${p.slug}-alternative`) ? 'tag' : q.startsWith('topic:') ? 'topic' : 'search';
      const names = await runSearch(q);
      if (!names) failed.add(p.slug);
      for (const name of names ?? []) {
        const set = byRepo.get(name) ?? new Set();
        set.add(how);
        byRepo.set(name, set);
      }
    }
    found.set(p.slug, byRepo);
    console.log(`${p.slug}: ${byRepo.size} candidates`);
  }
  for (const name of (await runSearch('topic:antipaywall archived:false fork:false')) ?? []) tagged.add(name);
  found.set('', new Map([...tagged].map((n) => [n, new Set<FoundBy>(['tag'])])));
  return { found, failed, seen };
}

async function contributorsOf(fullName: string): Promise<number | null> {
  const res = await gh(`https://api.github.com/repos/${fullName}/contributors?per_page=1&anon=0`);
  if (!res.ok) return null;
  const last = /[?&]page=(\d+)>; rel="last"/.exec(res.headers.get('link') ?? '');
  if (last) return Number(last[1]);
  const body = (await res.json().catch(() => [])) as unknown[];
  return Array.isArray(body) ? body.length : null;
}


async function main() {
  if (!TOKEN) throw new Error('GITHUB_TOKEN is required');
  const now = new Date();
  const catalog = loadCatalog();
  const db = DRY ? null : createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SECRET_KEY ?? '', { auth: { persistSession: false } });
  if (!DRY && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY)) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required (or pass --dry-run)');

  const run = db ? must(await db.from('sync_log').insert({ kind: 'github' }).select('id').single(), 'sync_log') : null;
  const finish = async (ok: boolean, note: string) => {
    console.log(`${ok ? 'Finished' : 'Stopped'}: ${note}`);
    if (db && run) await db.from('sync_log').update({ finished_at: new Date().toISOString(), ok, note }).eq('id', run.id);
  };

  try {
    if (db) await upsertCatalog(db, catalog.products, catalog.topics);

    const { found, failed, seen } = await findCandidates(catalog.products);
    // Hand-made links from the catalog count as found, and so do every repo they name.
    const removed = new Set(catalog.links.filter((l) => l.action === 'remove').map((l) => `${l.product}|${l.project.toLowerCase()}`));
    const manual = catalog.links.filter((l) => l.action === 'add');

    // Judge each search result on what the search already said: the junk filter, then whether it
    // really stands in for the product. Only repos that pass are read in full.
    const names = new Set<string>(manual.map((l) => l.project));
    const productBySlug = new Map(catalog.products.map((p) => [p.slug, p]));
    for (const [slug, byRepo] of found) {
      const p = productBySlug.get(slug);
      const ok = [...byRepo.entries()]
        .map(([n, how]) => ({ n, how, f: seen.get(n.toLowerCase()) }))
        .filter(({ f }) => f && passesFilter(f, catalog.blocklist, now).ok)
        .filter(({ f, how }) => !p || linkSource(f!, p, [...how]) !== null)
        .sort((a, b) => b.f!.stars - a.f!.stars)
        .slice(0, MAX_PER_PRODUCT);
      for (const { n } of ok) names.add(n);
      // Keep only what passed, so links below are built from the same short list.
      found.set(slug, new Map(ok.map(({ n, how }) => [n, how])));
    }
    // Every repo already listed is read again too, so one that was archived or deleted since gets unlisted.
    const alreadyListed = db
      ? (await fetchAllRows<{ full_name: string }>((a, b) => db.from('projects').select('full_name').eq('listed', true).order('full_name').range(a, b))).map((r) => r.full_name)
      : [];
    for (const n of alreadyListed) names.add(n);
    console.log(`${names.size} repos to read`);

    const facts = new Map<string, RepoFacts>();
    const issues = new Map<string, HelpIssue[]>();
    const read = await fetchReposResilient([...names], TOKEN, graph);
    for (const r of read.repos) facts.set(r.fullName.toLowerCase(), r);
    for (const [k, v] of read.issues) issues.set(k.toLowerCase(), v);
    if (read.failed.length) console.log(`GitHub couldn't answer for ${read.failed.length} repos; they're left as they were`);
    // A repo GitHub failed to answer for this run is not "gone": it keeps its listing.
    for (const n of read.failed) { const prev = seen.get(n.toLowerCase()); if (prev) facts.set(n.toLowerCase(), prev); }

    const listed = new Map<string, RepoFacts>();
    const rejected: { r: RepoFacts; reason: string }[] = [];
    for (const r of facts.values()) {
      const verdict = passesFilter(r, catalog.blocklist, now);
      if (verdict.ok) listed.set(r.fullName.toLowerCase(), r);
      else rejected.push({ r, reason: verdict.reason });
    }
    const gone = toUnlist(alreadyListed.map((n) => n.toLowerCase()), new Set(facts.keys()), new Set(listed.keys())).filter((n) => !facts.has(n) && !read.failed.some((f) => f.toLowerCase() === n));

    // product slug → [repo key, source]
    const links: { product: string; repo: string; source: 'topic' | 'search' | 'tag' | 'catalog'; score: number }[] = [];
    for (const p of catalog.products) {
      for (const [name, how] of found.get(p.slug) ?? []) {
        const key = name.toLowerCase();
        const r = listed.get(key);
        if (!r || removed.has(`${p.slug}|${key}`)) continue;
        const source = linkSource(r, p, [...how]);
        if (source) links.push({ product: p.slug, repo: key, source, score: how.size });
      }
    }
    for (const l of manual) if (listed.has(l.project.toLowerCase())) links.push({ product: l.product, repo: l.project.toLowerCase(), source: 'catalog', score: 10 });
    console.log(`${listed.size} listed, ${rejected.length} turned away, ${links.length} product links`);

    if (!db) return finish(true, `dry run: ${listed.size} listed, ${rejected.length} turned away, ${links.length} links`);

    // Projects: listed ones and turned-away ones (with the reason), keyed by GitHub id.
    const rowOf = (r: RepoFacts, ok: boolean, reason: string | null) => ({
      github_id: r.githubId, full_name: r.fullName, owner: r.fullName.split('/')[0], name: r.fullName.split('/')[1], url: r.url,
      description: r.description, homepage: r.homepage, topics: r.topics, license_spdx: r.licenseSpdx, license_name: r.licenseName,
      stars: r.stars, forks: r.forks, open_issues: r.openIssues, help_wanted: r.helpWanted, good_first: r.goodFirst,
      archived: r.archived, pushed_at: r.pushedAt, created_on_github: r.createdAt, latest_release_tag: r.latestReleaseTag,
      latest_release_at: r.latestReleaseAt, synced_at: now.toISOString(), listed: ok, reject_reason: reason,
    });
    const rows = [...[...listed.values()].map((r) => rowOf(r, true, null)), ...rejected.map(({ r, reason }) => rowOf(r, false, reason))];
    const ids = new Map<string, string>();
    for (let i = 0; i < rows.length; i += 200) {
      const saved = must(await db.from('projects').upsert(rows.slice(i, i + 200), { onConflict: 'github_id' }).select('id, full_name'), 'projects');
      for (const s of saved as { id: string; full_name: string }[]) ids.set(s.full_name.toLowerCase(), s.id);
    }

    const products = must(await db.from('products').select('id, slug'), 'products read') as { id: string; slug: string }[];
    const productId = new Map(products.map((p) => [p.slug, p.id]));
    const linkRows = links
      .filter((l) => productId.has(l.product) && ids.has(l.repo))
      .map((l) => ({ project_id: ids.get(l.repo)!, product_id: productId.get(l.product)!, source: l.source, score: l.score }));
    // Links are rebuilt from this run's searches and links.yml, which is the source of truth for
    // hand-made ones. A product whose searches didn't all answer keeps yesterday's links.
    const fresh = new Set(relinkable(catalog.products.map((p) => p.slug), failed).map((s) => productId.get(s)).filter(Boolean) as string[]);
    for (const pid of fresh) must(await db.from('project_products').delete().eq('product_id', pid), 'unlink');
    const keep = linkRows.filter((l) => fresh.has(l.product_id) || links.some((x) => x.source === 'catalog' && productId.get(x.product) === l.product_id && ids.get(x.repo) === l.project_id));
    for (let i = 0; i < keep.length; i += 500) must(await db.from('project_products').upsert(keep.slice(i, i + 500), { onConflict: 'project_id,product_id' }), 'links');
    // Repos GitHub no longer returns are unlisted (ones it returned are updated above with the reason).
    for (const n of gone) must(await db.from('projects').update({ listed: false, reject_reason: 'gone' }).ilike('full_name', n), 'unlist');
    if (failed.size) console.log(`Searches failed for: ${[...failed].join(', ')}; their links were kept`);

    const day = now.toISOString().slice(0, 10);
    const snapshots = [...listed.values()].filter((r) => ids.has(r.fullName.toLowerCase())).map((r) => ({ project_id: ids.get(r.fullName.toLowerCase())!, day, stars: r.stars, forks: r.forks }));
    for (let i = 0; i < snapshots.length; i += 500) must(await db.from('project_snapshots').upsert(snapshots.slice(i, i + 500), { onConflict: 'project_id,day' }), 'snapshots');

    for (const [key, list] of issues) {
      const pid = ids.get(key);
      if (!pid || !listed.has(key)) continue;
      must(await db.from('help_issues').delete().eq('project_id', pid), 'issues clear');
      if (list.length) must(await db.from('help_issues').insert(list.map((i) => ({ project_id: pid, number: i.number, title: i.title, url: i.url, labels: i.labels, comments: i.comments, updated_at: i.updatedAt }))), 'issues');
    }

    // Merges proposed in the catalog, applied once each.
    for (const m of catalog.merges) {
      const pair = must(await db.from('ideas').select('id, slug').in('slug', [m.from, m.into]), 'merge ideas') as { id: string; slug: string }[];
      const from = pair.find((p) => p.slug === m.from)?.id;
      const into = pair.find((p) => p.slug === m.into)?.id;
      if (!from || !into) continue;
      const seen = must(await db.from('merge_log').select('id').eq('from_idea', from).eq('into_idea', into).limit(1), 'merge seen') as unknown[];
      if (!seen.length) must(await db.rpc('merge_gap', { p_from: from, p_into: into, p_source: 'pr', p_reason: m.reason, p_by: null }), 'merge');
    }

    // Which pages search engines may see. Worked out before the slow steps below, so a run that
    // stops at the rate limit still keeps it right.
    const indexed = await markIndexable(db, now);
    const summary = `${listed.size} listed, ${rejected.length} turned away, ${gone.length} unlisted, ${keep.length} links, ${indexed} indexable`;
    // The directory itself is up to date now: record the run as synced.
    await finish(true, summary);

    // Slower details, refreshed on their own schedule. Stopping at the rate limit here is normal:
    // the next run carries on where this one left off.
    let contributorReads = 0;
    try {
      const stale = await fetchAllRows<{ id: string; full_name: string; stars: number; star_points_at: string | null; contributors_at: string | null }>((a, b) =>
        db.from('projects').select('id, full_name, stars, star_points_at, contributors_at').eq('listed', true).order('stars', { ascending: false }).range(a, b));
      // Star history comes from the daily counts saved above (project_snapshots): GitHub no longer
      // lists who starred a repo or when, so there is nothing older to fetch.
      for (const p of stale.filter((p) => !p.contributors_at || now.getTime() - Date.parse(p.contributors_at) > CONTRIBUTOR_REFRESH_DAYS * DAY)) {
        const n = await contributorsOf(p.full_name);
        contributorReads++;
        if (n !== null) must(await db.from('projects').update({ contributors: n, contributors_at: now.toISOString() }).eq('id', p.id), 'contributors');
      }
      await finish(true, `${summary}, ${contributorReads} contributor counts`);
    } catch (e) {
      if (!(e instanceof RateLimited)) throw e;
      await markIndexable(db, now);
      await finish(true, `${summary}, ${contributorReads} contributor counts; details stopped at the rate limit`);
    }
  } catch (e) {
    if (e instanceof RateLimited) return finish(false, 'rate limit');
    await finish(false, e instanceof Error ? e.message.slice(0, 300) : 'failed');
    throw e;
  }
}

/** Sets `indexable` on every listed project from its links, the gaps that name it, and its history. */
async function markIndexable(db: SupabaseClient, now: Date): Promise<number> {
  const gapRepos = new Set<string>();
  const ideas = await fetchAllRows<{ existing_repos: { fullName?: string }[] }>((a, b) => db.from('ideas').select('existing_repos').eq('status', 'listed').order('created_at').range(a, b));
  for (const i of ideas) for (const r of i.existing_repos ?? []) if (r.fullName) gapRepos.add(r.fullName.toLowerCase());
  const linkCount = new Map<string, number>();
  const links = await fetchAllRows<{ project_id: string }>((a, b) => db.from('project_products').select('project_id').order('project_id').range(a, b));
  for (const l of links) linkCount.set(l.project_id, (linkCount.get(l.project_id) ?? 0) + 1);
  const projects = await fetchAllRows<{ id: string; full_name: string; stars: number; pushed_at: string; star_points_at: string | null; indexable: boolean }>((a, b) =>
    db.from('projects').select('id, full_name, stars, pushed_at, star_points_at, indexable').eq('listed', true).order('id').range(a, b));
  let count = 0;
  for (const p of projects) {
    const indexable = isIndexable({ productLinks: linkCount.get(p.id) ?? 0, gapLinks: gapRepos.has(p.full_name.toLowerCase()) ? 1 : 0, hasStarPoints: Boolean(p.star_points_at), stars: p.stars, pushedAt: p.pushed_at }, now);
    if (indexable) count++;
    if (indexable !== p.indexable) must(await db.from('projects').update({ indexable }).eq('id', p.id), 'indexable');
  }
  return count;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
