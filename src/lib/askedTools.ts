// Paid tools people look up by pasting the tool's website. The first person to ask about a tool
// costs one page read and a handful of GitHub searches; the answer is kept, so everyone after
// them gets it at once. No AI model is involved anywhere.

import type { SupabaseClient } from '@supabase/supabase-js';
import { findMatches } from './match';
import { fetchPage } from './siteFetch';
import { domainLabel, rankSiteHits, readPrice, readSite, siteQueries, visibleText, type SiteFacts, type SiteHit, type SitePrice } from './siteReader';

export type AskedTool = {
  domain: string;
  name: string;
  tagline: string;
  description: string;
  price: SitePrice | null;
  words: string[];
  phrases: string[];
  repos: SiteHit[];
  bestStars: number;
  asks: number;
  status: 'new' | 'listed' | 'hidden';
  readOk: boolean;
  fetchedAt: string;
};

const COLUMNS = 'domain, name, tagline, description, price_cents, price_period, words, phrases, repos, best_stars, askers, status, read_ok, fetched_at';
const DAY = 24 * 3600 * 1000;

function toAsked(r: any): AskedTool {
  return {
    domain: r.domain, name: r.name, tagline: r.tagline ?? '', description: r.description ?? '',
    price: r.price_cents != null && r.price_period ? { cents: r.price_cents, period: r.price_period } : null,
    words: r.words ?? [], phrases: r.phrases ?? [],
    repos: Array.isArray(r.repos) ? r.repos.filter((h: any) => typeof h?.fullName === 'string' && /^[\w.-]+\/[\w.-]+$/.test(h.fullName)) : [],
    bestStars: r.best_stars ?? 0, asks: (r.askers ?? []).length, status: r.status, readOk: r.read_ok !== false, fetchedAt: r.fetched_at,
  };
}

export async function getAsked(db: SupabaseClient, domain: string): Promise<AskedTool | null> {
  const { data, error } = await db.from('asked_tools').select(COLUMNS).eq('domain', domain).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toAsked(data) : null;
}

/** An answer is looked up again after two weeks, or after an hour when GitHub gave nothing the first time. */
export function isStale(tool: Pick<AskedTool, 'fetchedAt' | 'repos' | 'readOk'>, now = new Date()): boolean {
  const age = now.getTime() - Date.parse(tool.fetchedAt);
  return age > 14 * DAY || ((tool.repos.length === 0 || !tool.readOk) && age > 3600 * 1000);
}

/** Counts this browser or account as someone who asked about the tool, once. Never throws. */
export async function countAsk(db: SupabaseClient, domain: string, asker: string): Promise<void> {
  try {
    const { data } = await db.from('asked_tools').select('askers').eq('domain', domain).maybeSingle();
    const askers: string[] = data?.askers ?? [];
    if (!data || askers.includes(asker) || askers.length >= 5000) return;
    await db.from('asked_tools').update({ askers: [...askers, asker] }).eq('domain', domain);
  } catch {
    // Counting is a nicety; the page still shows.
  }
}

const letters = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** The paid tool we already track that lives at this address, by name: calendly.com is Calendly. */
export function catalogMatch<T extends { slug: string; name: string; aliases?: string[] | null }>(products: T[], domain: string): T | null {
  const keys = new Set([letters(domainLabel(domain)), letters(domain)]);
  return products.find((p) => keys.has(p.slug.replace(/-/g, '')) || keys.has(letters(p.name)) || (p.aliases ?? []).some((a) => keys.has(letters(a)))) ?? null;
}

let productCache: { at: number; rows: { slug: string; name: string; aliases: string[] | null }[] } | null = null;
export async function catalogSlugFor(db: SupabaseClient, domain: string): Promise<string | null> {
  if (!productCache || Date.now() - productCache.at > 10 * 60_000) {
    const { data, error } = await db.from('products').select('slug, name, aliases');
    if (error) throw new Error(error.message);
    productCache = { at: Date.now(), rows: data ?? [] };
  }
  return catalogMatch(productCache.rows, domain)?.slug ?? null;
}

async function searchGithub(queries: string[], token: string | undefined, fetchImpl: typeof fetch): Promise<SiteHit[] | null> {
  const headers: Record<string, string> = { accept: 'application/vnd.github+json', 'user-agent': 'antipaywall' };
  if (token) headers.authorization = `Bearer ${token}`;
  const run = async (q: string): Promise<SiteHit[] | null> => {
    const res = await fetchImpl(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=15`, { headers, signal: AbortSignal.timeout(5000) }).catch(() => null);
    if (!res || !res.ok) return null;
    const body = (await res.json().catch(() => null)) as any;
    return ((body?.items ?? []) as any[]).map((r) => ({
      fullName: String(r.full_name),
      url: String(r.html_url),
      description: String(r.description ?? '').slice(0, 200),
      stars: Number(r.stargazers_count) || 0,
      license: r.license?.spdx_id && r.license.spdx_id !== 'NOASSERTION' ? String(r.license.spdx_id) : null,
      topics: Array.isArray(r.topics) ? r.topics.map(String) : [],
    }));
  };
  const lists = await Promise.all(queries.map(run));
  return lists.every((l) => l === null) ? null : lists.flatMap((l) => l ?? []);
}

export type Lookup = { tool: AskedTool; githubDown: boolean };

/**
 * Reads the tool's website, searches GitHub with its own words, and saves the answer. People who
 * already asked stay counted and an organizer's decision about the page is kept.
 */
export async function lookupTool(
  db: SupabaseClient,
  domain: string,
  opts: { token?: string; fetchImpl?: typeof fetch; readPage?: typeof fetchPage } = {},
): Promise<Lookup> {
  const readPage = opts.readPage ?? fetchPage;
  const html = (await readPage(`https://${domain}/`)) ?? (await readPage(`https://www.${domain}/`));
  const label = domainLabel(domain);
  const facts: SiteFacts = html
    ? readSite(html, domain)
    : { name: label.charAt(0).toUpperCase() + label.slice(1), tagline: '', description: '', price: null, words: [], phrases: [] };

  // The price is often only on the pricing page; it is read while GitHub is being searched.
  const [pricing, github, tracked] = await Promise.all([
    html && !facts.price ? readPage(`https://${domain}/pricing`, 2500) : Promise.resolve(null),
    searchGithub(html ? siteQueries(facts, domain) : siteQueries(facts, domain).slice(0, 2), opts.token, opts.fetchImpl ?? fetch),
    facts.words.length ? findMatches(db, facts.phrases[0] ?? facts.words.slice(0, 3).join(' '), 8).then((m) => m.projects, () => []) : Promise.resolve([]),
  ]);
  const price = facts.price ?? (pricing ? readPrice(visibleText(pricing)) : null);
  const ours: SiteHit[] = tracked.map((p) => ({ fullName: p.fullName, url: `https://github.com/${p.fullName}`, description: p.description ?? '', stars: p.stars, license: null }));
  const repos = rankSiteHits([...(github ?? []), ...ours], facts).map(({ fullName, url, description, stars, license }) => ({ fullName, url, description, stars, license }));

  const row = {
    domain, name: facts.name, tagline: facts.tagline, description: facts.description,
    price_cents: price?.cents ?? null, price_period: price?.period ?? null,
    words: facts.words, phrases: facts.phrases, repos, best_stars: repos.reduce((m, r) => Math.max(m, r.stars), 0),
    read_ok: Boolean(html), fetched_at: new Date().toISOString(),
  };
  const { data, error } = await db.from('asked_tools').upsert(row, { onConflict: 'domain' }).select(COLUMNS).single();
  if (error) throw new Error(error.message);
  return { tool: toAsked(data), githubDown: github === null };
}

/** Tools people asked about that fit a search: by name or address, or by sharing two of its words. */
export async function matchAsked(db: SupabaseClient, q: string, words: string[], limit = 3): Promise<{ domain: string; name: string; tagline: string }[]> {
  const term = q.toLowerCase().replace(/[^a-z0-9.-]/g, '');
  const filters = [term.length >= 3 ? `name.ilike.${term}%` : '', term.length >= 3 ? `domain.ilike.${term}%` : '', words.length ? `words.ov.{${words.filter((w) => /^[a-z0-9]+$/.test(w)).slice(0, 6).join(',')}}` : ''].filter((f) => f && !f.endsWith('{}'));
  if (!filters.length) return [];
  const { data, error } = await db.from('asked_tools').select('domain, name, tagline, words, askers').neq('status', 'hidden').or(filters.join(',')).limit(40);
  if (error) return [];
  return ((data ?? []) as any[])
    .map((r) => {
      const named = term.length >= 3 && (String(r.name).toLowerCase().startsWith(term) || String(r.domain).startsWith(term));
      const shared = words.filter((w) => (r.words ?? []).includes(w)).length;
      return { r, named, shared };
    })
    .filter((x) => x.named || x.shared >= Math.min(2, words.length))
    .sort((a, b) => Number(b.named) - Number(a.named) || b.shared - a.shared || (b.r.askers?.length ?? 0) - (a.r.askers?.length ?? 0))
    .slice(0, limit)
    .map(({ r }) => ({ domain: r.domain, name: r.name, tagline: r.tagline ?? '' }));
}
