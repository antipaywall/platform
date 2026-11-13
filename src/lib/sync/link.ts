// Whether a repo the sync found really stands in for a paid product. Broad topics catch the
// wrong things ("scheduling" finds cron schedulers as well as booking pages), so a repo found by
// topic or search must also mention the product's name, an alias or one of its plain words.

import type { RepoFacts } from './filter';

export type FoundBy = 'tag' | 'topic' | 'search';
const STRENGTH: FoundBy[] = ['tag', 'topic', 'search'];

const mentions = (haystack: string, needle: string) =>
  new RegExp(`(^|[^\\p{L}\\p{N}])${needle.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u').test(haystack);

export function linkSource(
  r: RepoFacts,
  p: { slug: string; name: string; words: readonly string[]; aliases: readonly string[]; excludes: readonly string[] },
  foundBy: readonly FoundBy[],
): FoundBy | null {
  if (p.excludes.some((e) => e.toLowerCase() === r.fullName.toLowerCase())) return null;
  const best = STRENGTH.find((s) => foundBy.includes(s));
  if (!best) return null;
  if (best === 'tag' || r.topics.includes(`${p.slug}-alternative`)) return best;
  const haystack = [r.fullName, r.description ?? '', r.topics.join(' ').replace(/-/g, ' ')].join(' ').toLowerCase();
  // Naming the product (or an alias) is enough. Otherwise it must share at least two of the
  // product's plain words: one broad word like "scheduling" also fits cron jobs and music.
  if ([p.name, ...p.aliases].some((t) => t.trim() && mentions(haystack, t.trim()))) return best;
  const shared = p.words.filter((w) => w.trim() && mentions(haystack, w.trim())).length;
  return shared >= 2 ? best : null;
}
