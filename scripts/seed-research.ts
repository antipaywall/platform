// Finds which paid products people most want a free, open-source version of, from public data.
//
// 1. Demand: Hacker News stories and comments (through its free search API) that ask for or
//    offer "an alternative to X", "a free version of X", "a replacement for X", over five years.
//    Each product counts once per thread.
// 2. Coverage: the stars of the best GitHub repo that already stands in for it.
// 3. The gap score is demand shrunk by coverage.
//
// The result is written to catalog/research/seed-<date>.json for people to read, rerun or
// challenge. Picking the products that become catalog files is done by a person from that list.
//
//   pnpm seed:research            (GITHUB_TOKEN optional; without it GitHub allows 10 searches a minute)

import { writeFileSync } from 'node:fs';
import { extractAlternativeTo, normalizeProduct, rankCandidates } from '../src/lib/research';

const PHRASES = ['"alternative to"', '"alternatives to"', '"free version of"', '"replacement for"', '"open source version of"'];
const YEARS = 5;
const QUARTER = 91 * 24 * 3600;
const MIN_THREADS = 3;
const COVERAGE_CHECKS = 160;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Hit = { objectID: string; story_id?: number; title?: string; story_title?: string; comment_text?: string };

async function hn(params: Record<string, string>): Promise<{ hits: Hit[]; nbPages: number }> {
  const url = `https://hn.algolia.com/api/v1/search_by_date?${new URLSearchParams(params)}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url).catch(() => null);
    if (res?.ok) return (await res.json()) as { hits: Hit[]; nbPages: number };
    await sleep(3000 * (attempt + 1));
  }
  throw new Error(`Hacker News search failed: ${url}`);
}

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<');

async function demand(): Promise<Map<string, { threads: Set<string>; spellings: Map<string, number> }>> {
  const now = Math.floor(Date.now() / 1000);
  const start = now - YEARS * 365 * 24 * 3600;
  const found = new Map<string, { threads: Set<string>; spellings: Map<string, number> }>();
  let requests = 0;
  for (const phrase of PHRASES) {
    for (const tags of ['story', 'comment']) {
      for (let from = start; from < now; from += QUARTER) {
        for (let page = 0; page < 10; page++) {
          const body = await hn({ query: phrase, tags, hitsPerPage: '1000', page: String(page), numericFilters: `created_at_i>=${from},created_at_i<${from + QUARTER}` });
          requests++;
          for (const h of body.hits) {
            const text = tags === 'story' ? h.title ?? '' : stripHtml(h.comment_text ?? '');
            const thread = String(h.story_id ?? h.objectID);
            for (const name of extractAlternativeTo(text)) {
              const key = normalizeProduct(name);
              if (key.length < 2) continue;
              const entry = found.get(key) ?? { threads: new Set(), spellings: new Map() };
              entry.threads.add(thread);
              entry.spellings.set(name, (entry.spellings.get(name) ?? 0) + 1);
              found.set(key, entry);
            }
          }
          await sleep(400);
          if (page + 1 >= body.nbPages) break;
        }
      }
      console.log(`${phrase} ${tags}: ${requests} requests so far, ${found.size} names`);
    }
  }
  return found;
}

async function coverage(name: string, token: string | undefined): Promise<{ stars: number; repo: string | null }> {
  const headers: Record<string, string> = { accept: 'application/vnd.github+json', 'user-agent': 'antipaywall-seed-research' };
  if (token) headers.authorization = `Bearer ${token}`;
  const slug = normalizeProduct(name).replace(/\s+/g, '-');
  for (const q of [`topic:${slug}-alternative`, `"${name} alternative" in:name,description,topics`]) {
    const res = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(q + ' archived:false')}&sort=stars&order=desc&per_page=1`, { headers });
    await sleep(token ? 2200 : 6500);
    if (!res.ok) continue;
    const body = (await res.json()) as { items?: { full_name: string; stargazers_count: number }[] };
    const top = body.items?.[0];
    if (top) return { stars: top.stargazers_count, repo: top.full_name };
  }
  return { stars: 0, repo: null };
}

async function main() {
  const found = await demand();
  const rows = [...found.entries()]
    .filter(([, v]) => v.threads.size >= MIN_THREADS)
    .map(([key, v]) => ({ key, name: [...v.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0], threads: v.threads.size }))
    .sort((a, b) => b.threads - a.threads);
  console.log(`${rows.length} names with ${MIN_THREADS}+ threads; checking GitHub for the top ${COVERAGE_CHECKS}`);
  const token = process.env.GITHUB_TOKEN;
  const checked: { key: string; name: string; threads: number; coverageStars: number; topRepo: string | null }[] = [];
  for (const r of rows.slice(0, COVERAGE_CHECKS)) {
    const c = await coverage(r.name, token);
    checked.push({ ...r, coverageStars: c.stars, topRepo: c.repo });
  }
  const ranked = rankCandidates(checked);
  const byName = new Map(checked.map((c) => [c.name, c]));
  const date = new Date().toISOString().slice(0, 10);
  const out = {
    generated_at: new Date().toISOString(),
    method: 'Hacker News stories and comments matching each phrase, five years, one count per thread per product; coverage = stars of the top GitHub repo for topic:<name>-alternative, else "<name> alternative".',
    phrases: PHRASES,
    min_threads: MIN_THREADS,
    candidates: ranked.map((r) => ({ ...r, key: byName.get(r.name)?.key, topRepo: byName.get(r.name)?.topRepo, coverageStars: byName.get(r.name)?.coverageStars })),
    unchecked: rows.slice(COVERAGE_CHECKS),
  };
  writeFileSync(`catalog/research/seed-${date}.json`, JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote catalog/research/seed-${date}.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
