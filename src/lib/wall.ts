// The wall's rule for whether a paid tool has a free alternative people rely on. Every link needs
// evidence (src/lib/sync/link.ts), so every link counts. "Relied on" is the platform's usual bar:
// SOLID_STARS stars.
import type { SupabaseClient } from '@supabase/supabase-js';
import { SOLID_STARS, TRUSTED_SOURCES } from './products';
export { TRUSTED_SOURCES };

export type BrickState = 'solid' | 'some' | 'gap';

/** Per product id: how many trusted free alternatives it has and the stars of the best one. */
export async function trustedAlternatives(db: SupabaseClient): Promise<Map<string, { count: number; best: number }>> {
  const out = new Map<string, { count: number; best: number }>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('project_products')
      .select('product_id, projects!inner(listed, stars)')
      .in('source', [...TRUSTED_SOURCES])
      .eq('projects.listed', true)
      .order('product_id')
      .order('project_id')
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as any[]) {
      const stars = Number(r.projects?.stars ?? r.projects?.[0]?.stars ?? 0);
      const cur = out.get(r.product_id) ?? { count: 0, best: 0 };
      out.set(r.product_id, { count: cur.count + 1, best: Math.max(cur.best, stars) });
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}

export function brickState(count: number, best: number): BrickState {
  return best >= SOLID_STARS ? 'solid' : count > 0 ? 'some' : 'gap';
}
