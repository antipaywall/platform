// The open catalog: paid products, tracked topics, hand-made links, proposed merges and the
// blocklist, kept as files in catalog/ so anyone can change them with a pull request. The sync
// copies them into the database; pages read the database, never these files.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

export const CATEGORIES = [
  'Scheduling', 'Forms and surveys', 'Video and calls', 'Docs and notes', 'Design', 'Email and newsletters',
  'Analytics', 'Support and chat', 'Project management', 'Files and storage', 'Passwords and security',
  'Writing', 'Social media', 'Selling online', 'Websites', 'Money and invoicing', 'Automation', 'AI tools',
  'Games', 'Developer tools', 'Team chat', 'Photos and video', 'Music and media', 'Hosting and cloud', 'Office',
  'Sales and CRM', 'Science and maths', 'Other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export type Product = {
  slug: string;
  name: string;
  category: Category;
  price?: { cents: number; period: 'month' | 'year' | 'once' };
  words: string[];
  topics: string[];
  search_terms: string[];
  aliases: string[];
  excludes: string[];
  blurb: string;
};
export type Topic = { slug: string; name: string; blurb: string };
export type Link = { project: string; product: string; action: 'add' | 'remove'; reason: string };
export type Merge = { from: string; into: string; reason: string };
export type Catalog = { products: Product[]; topics: Topic[]; links: Link[]; merges: Merge[]; blocklist: { repos: string[]; words: string[] } };

export class CatalogError extends Error {}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function strings(raw: unknown, field: string, file: string, max: number, itemMax = 80): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.some((s) => typeof s !== 'string' || !s.trim() || s.length > itemMax)) {
    throw new CatalogError(`${file}: ${field} must be a list of short text items`);
  }
  if (raw.length > max) throw new CatalogError(`${file}: ${field} has more than ${max} items`);
  return raw.map((s: string) => s.trim());
}

function text(raw: unknown, field: string, file: string, max: number, required = true): string {
  if (raw === undefined || raw === null) {
    if (required) throw new CatalogError(`${file}: ${field} is missing`);
    return '';
  }
  if (typeof raw !== 'string' || (required && !raw.trim()) || raw.length > max) {
    throw new CatalogError(`${file}: ${field} must be text up to ${max} characters`);
  }
  return raw.trim();
}

function slug(raw: unknown, field: string, file: string): string {
  if (typeof raw !== 'string' || !SLUG.test(raw)) throw new CatalogError(`${file}: ${field} must be lowercase words joined by dashes`);
  return raw;
}

/** Checks one product file and returns it with every list present. Throws CatalogError naming the file and field. */
export function parseProduct(raw: unknown, file: string): Product {
  if (!isObj(raw)) throw new CatalogError(`${file}: not a product`);
  const category = raw.category;
  if (typeof category !== 'string' || !(CATEGORIES as readonly string[]).includes(category)) {
    throw new CatalogError(`${file}: category must be one of ${CATEGORIES.join(', ')}`);
  }
  let price: Product['price'];
  if (raw.price !== undefined && raw.price !== null) {
    const p = raw.price;
    if (!isObj(p) || !Number.isInteger(p.cents) || (p.cents as number) < 0 || !['month', 'year', 'once'].includes(p.period as string)) {
      throw new CatalogError(`${file}: price must be { cents: a whole number of cents, period: month, year or once }`);
    }
    price = { cents: p.cents as number, period: p.period as 'month' | 'year' | 'once' };
  }
  return {
    slug: slug(raw.slug, 'slug', file),
    name: text(raw.name, 'name', file, 60),
    category: category as Category,
    ...(price ? { price } : {}),
    words: strings(raw.words, 'words', file, 40),
    topics: strings(raw.topics, 'topics', file, 12, 50),
    search_terms: strings(raw.search_terms, 'search_terms', file, 8),
    aliases: strings(raw.aliases, 'aliases', file, 8),
    excludes: strings(raw.excludes, 'excludes', file, 40, 120),
    blurb: text(raw.blurb, 'blurb', file, 300),
  };
}

function parseTopic(raw: unknown, file: string): Topic {
  if (!isObj(raw)) throw new CatalogError(`${file}: not a topic`);
  return { slug: slug(raw.slug, 'slug', file), name: text(raw.name, 'name', file, 60), blurb: text(raw.blurb, 'blurb', file, 300) };
}

function parseLink(raw: unknown, file: string): Link {
  if (!isObj(raw) || typeof raw.project !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(raw.project)) throw new CatalogError(`${file}: a link needs project: owner/repo`);
  if (raw.action !== 'add' && raw.action !== 'remove') throw new CatalogError(`${file}: a link's action must be add or remove`);
  return { project: raw.project, product: slug(raw.product, 'product', file), action: raw.action, reason: text(raw.reason, 'reason', file, 300) };
}

function parseMerge(raw: unknown, file: string): Merge {
  if (!isObj(raw)) throw new CatalogError(`${file}: not a merge`);
  return { from: text(raw.from, 'from', file, 120), into: text(raw.into, 'into', file, 120), reason: text(raw.reason, 'reason', file, 300) };
}

const readYaml = (path: string): unknown => (existsSync(path) ? parse(readFileSync(path, 'utf8')) : null);
const list = (v: unknown, file: string): unknown[] => {
  if (v === null || v === undefined) return [];
  if (!Array.isArray(v)) throw new CatalogError(`${file}: must be a list`);
  return v;
};

/** Reads and checks the whole catalog. For scripts and tests, never for pages. */
export function loadCatalog(dir = 'catalog'): Catalog {
  const productDir = join(dir, 'products');
  const products = existsSync(productDir)
    ? readdirSync(productDir).filter((f) => f.endsWith('.yml')).sort().map((f) => {
        const p = parseProduct(readYaml(join(productDir, f)), f);
        if (`${p.slug}.yml` !== f) throw new CatalogError(`${f}: the file name must be the slug (${p.slug}.yml)`);
        return p;
      })
    : [];
  const block = readYaml(join(dir, 'blocklist.yml'));
  const blockObj = isObj(block) ? block : {};
  return {
    products,
    topics: list(readYaml(join(dir, 'topics.yml')), 'topics.yml').map((t) => parseTopic(t, 'topics.yml')),
    links: list(readYaml(join(dir, 'links.yml')), 'links.yml').map((l) => parseLink(l, 'links.yml')),
    merges: list(readYaml(join(dir, 'merges.yml')), 'merges.yml').map((m) => parseMerge(m, 'merges.yml')),
    blocklist: {
      repos: strings(blockObj.repos, 'repos', 'blocklist.yml', 5000, 140).map((r) => r.toLowerCase()),
      words: strings(blockObj.words, 'words', 'blocklist.yml', 500).map((w) => w.toLowerCase()),
    },
  };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** True when the text contains a blocked word or phrase as a whole word, in any case. */
export function isBlocked(text: string, words: readonly string[]): boolean {
  if (!text) return false;
  return words.some((w) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(w)}($|[^\\p{L}\\p{N}])`, 'iu').test(text));
}
