// Decisions the sync makes about what it may change, kept apart so they can be tested.

/** Products whose automatic links may be replaced: every one of their searches answered. */
export const relinkable = (products: string[], failed: Set<string>) => products.filter((p) => !failed.has(p));

/**
 * Listed repos to unlist: GitHub no longer returns them (deleted, renamed away, private), or
 * they now fail the junk filter (archived, abandoned, license removed).
 */
export function toUnlist(listed: string[], fetched: Set<string>, passed: Set<string>): string[] {
  return listed.filter((n) => !fetched.has(n) || !passed.has(n));
}

/** Reads every row, a page at a time: Supabase returns at most 1,000 rows per request. */
export async function fetchAllRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, size = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < size) return out;
  }
}

type LinkRow = { project_id: string; product_id: string; source: string; score: number };

/** One link per project and product, so a batch write never names the same pair twice. Hand-made links win. */
export function dedupeLinks(rows: LinkRow[]): LinkRow[] {
  const out = new Map<string, LinkRow>();
  for (const r of rows) {
    const key = `${r.project_id}|${r.product_id}`;
    const prev = out.get(key);
    if (!prev || (r.source === 'catalog' && prev.source !== 'catalog') || (prev.source !== 'catalog' && r.score > prev.score)) out.set(key, r);
  }
  return [...out.values()];
}
