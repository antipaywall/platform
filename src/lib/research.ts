// Picking the first paid products from public data instead of a guessed list. Pure functions,
// used by scripts/seed-research.ts and tested on their own.

const PHRASE = /\b(?:alternatives?\s+to|free\s+version\s+of|open[-\s]?source\s+version\s+of|replacement\s+for)\s+/gi;
// A product name: up to three words, the first starting with a capital letter, the rest with a
// capital or a digit ("Google Analytics", "GTA 6", "Cal.com").
const NAME = /^([A-Z][\w.+'&-]*)(?:\s+([A-Z0-9][\w.+'&-]*))?(?:\s+([A-Z0-9][\w.+'&-]*))?/;

/** Product names mentioned as the thing someone wants a free or open-source version of. */
export function extractAlternativeTo(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(PHRASE)) {
    const rest = text.slice((m.index ?? 0) + m[0].length);
    const n = NAME.exec(rest);
    if (!n) continue;
    // A word ending in a full stop ends the sentence, and so the name.
    const words: string[] = [];
    for (const w of [n[1], n[2], n[3]].filter(Boolean) as string[]) {
      words.push(w.replace(/[.'&+-]+$/, ''));
      if (/\.$/.test(w)) break;
    }
    const name = words.join(' ');
    if (name) found.push(name);
  }
  return found;
}

/** One spelling per product: lowercase, no domain ending, no stray punctuation. */
export function normalizeProduct(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\.(com|io|ai|app|so|co|org|net|dev)\b/g, '')
    .replace(/[^\p{L}\p{N}+#\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type Ranked = { name: string; demand: number; coverage: number; gapScore: number };

/** Demand is how many separate threads asked; coverage shrinks the gap score as stars grow. */
export function rankCandidates(rows: { name: string; threads: number; coverageStars: number }[]): Ranked[] {
  return rows
    .map((r) => {
      const coverage = Math.log10(1 + Math.max(0, r.coverageStars));
      return { name: r.name, demand: r.threads, coverage, gapScore: r.threads / (1 + coverage) };
    })
    .sort((a, b) => b.gapScore - a.gapScore || b.demand - a.demand);
}
