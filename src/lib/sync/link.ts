// Whether a repo the sync found really stands in for a paid product. Antipaywall has to be
// objective, so a link needs evidence anyone can check on GitHub: the repo tags itself
// <slug>-alternative, or its own name, description or topics call it an alternative to the
// product by name ("an open-source Lovable alternative", "a Calendly clone"). Sharing a broad
// topic or a few plain words is not evidence: "no code" and "prompt" also fit prompt packs and
// tutorials. Lists, guides and prompt collections are never alternatives, whatever they say.
// Hand-made links in catalog/links.yml don't come through here; each carries its own reason.

import type { RepoFacts } from './filter';

export type FoundBy = 'tag' | 'topic' | 'search';
const STRENGTH: FoundBy[] = ['tag', 'topic', 'search'];

const escape = (s: string) => s.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const word = (s: string) => `(?<![\\p{L}\\p{N}])${escape(s)}(?![\\p{L}\\p{N}])`;

/** Words a repo uses when it says it replaces something. */
const REPLACES = '(alternatives?|clone|replacement|substitute)';
/** Words before a product's name that say "a free version of it" ("open-source Calendly"). */
const FREE_VERSION = '(open[- ]?source|self[- ]?hosted|foss|libre)';

/** Awesome-lists, tutorials, courses and prompt packs: reading material, not software that does the job. */
export function isReadingMaterial(r: Pick<RepoFacts, 'fullName' | 'description' | 'topics'>): boolean {
  const name = r.fullName.split('/')[1]?.toLowerCase() ?? '';
  if (/^awesome([-_.]|$)/.test(name)) return true;
  const topics = new Set(r.topics.map((t) => t.toLowerCase()));
  const READING = ['awesome', 'awesome-list', 'awesome-lists', 'list', 'tutorial', 'tutorials', 'course', 'courses', 'guide', 'guides', 'cheatsheet', 'cheatsheets', 'prompts', 'system-prompts', 'prompt-collection', 'books', 'roadmap', 'interview-questions'];
  if (READING.some((t) => topics.has(t))) return true;
  return /(^|[^\p{L}])(awesome list|curated list|a list of|collection of (prompts|resources|tools)|tutorials?|beginner'?s guide|complete guide|step[- ]by[- ]step guide|course|system prompts?|prompt (pack|library|collection)|cheat ?sheet)([^\p{L}]|$)/iu.test(r.description ?? '');
}

/** Whether the repo's own words call it a free version of, or an alternative to, one of these names. */
export function saysItReplaces(r: Pick<RepoFacts, 'fullName' | 'description' | 'topics'>, names: readonly string[]): boolean {
  const text = [r.fullName.replace(/[-_/]/g, ' '), r.description ?? '', r.topics.join(' ').replace(/-/g, ' ')].join(' . ').toLowerCase();
  const said = (re: string) => new RegExp(re, 'u').test(text);
  return names.some((raw) => {
    const n = raw.trim();
    if (!n) return false;
    const name = word(n);
    if (!said(name)) return false;
    // "Calendly alternative", "alternative to Calendly", "v0 / Lovable / Bolt alternative",
    // "Calendly clone", "open-source Calendly". The replace-word must sit close to the name.
    return (
      said(`${name}[^.;!?\\n]{0,40}${REPLACES}`) ||
      said(`${REPLACES}[^.;!?\\n]{0,25}${name}`) ||
      said(`${FREE_VERSION}\\s+${name}`)
    );
  });
}

export function linkSource(
  r: RepoFacts,
  p: { slug: string; name: string; aliases: readonly string[]; excludes: readonly string[] },
  foundBy: readonly FoundBy[],
): FoundBy | null {
  if (p.excludes.some((e) => e.toLowerCase() === r.fullName.toLowerCase())) return null;
  const best = STRENGTH.find((s) => foundBy.includes(s));
  if (!best) return null;
  if (isReadingMaterial(r)) return null;
  if (r.topics.some((t) => t.toLowerCase() === `${p.slug}-alternative`)) return best;
  // Aliases are websites (lovable.dev). Repos write the bare name ("Lovable"), which is only
  // used when it is how the product's own name starts, so "workspace.google.com" never means "workspace".
  const sites = p.aliases.map((a) => a.toLowerCase().replace(/^www\./, ''));
  const bare = sites.map((s) => s.split('.')[0]).filter((b) => b.length >= 3 && p.name.toLowerCase().replace(/[^a-z0-9]/g, '').startsWith(b));
  const names = [p.name, ...sites, ...bare];
  return saysItReplaces(r, names) ? best : null;
}
