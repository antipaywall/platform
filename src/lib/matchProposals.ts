// Checks on what `pnpm match` proposes, before anything is written to the catalog. The model
// suggests; these rules decide what is allowed to become a pull request.

export type Proposal = { from: string; into: string; reason: string };

/** Merges that may be proposed: real gaps, not the same gap, not blocked, not already merged, no chains. */
export function acceptMerges(
  proposals: Proposal[],
  ctx: { gaps: string[]; merged: Set<string>; blocked: Set<string>; existing: { from: string; into: string }[] },
): Proposal[] {
  const known = new Set(ctx.gaps);
  const seen = new Set(ctx.existing.map((e) => e.from));
  const out: Proposal[] = [];
  const leaving = new Set<string>();
  for (const p of proposals) {
    const pair = [p.from, p.into].sort().join('|');
    if (!known.has(p.from) || !known.has(p.into) || p.from === p.into) continue;
    if (ctx.merged.has(p.from) || ctx.merged.has(p.into) || ctx.blocked.has(pair) || seen.has(p.from)) continue;
    // A gap that is being merged away can't also receive a merge, and a target can't leave.
    if (leaving.has(p.into) || out.some((o) => o.into === p.from)) continue;
    out.push({ from: p.from, into: p.into, reason: p.reason.trim().slice(0, 300) });
    leaving.add(p.from);
    seen.add(p.from);
  }
  return out;
}

/** A product's plain words with new ones added: lowercase, no repeats, at most 40. */
export function mergeWords(current: string[], suggested: string[]): string[] {
  const out: string[] = [];
  for (const w of [...current, ...suggested]) {
    const t = w.trim().toLowerCase();
    if (t && t.length <= 80 && !out.includes(t)) out.push(t);
  }
  return out.slice(0, 40);
}
