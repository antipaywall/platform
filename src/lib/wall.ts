// The wall's rule for whether a paid tool has a free alternative people rely on. Only matches we
// trust count: hand-picked ones (catalog), ones whose own README or name names the tool (search),
// and repos tagged for it. Broad topic matches are useful for browsing but too loose to paint a
// brick. "Relied on" is the platform's usual bar: SOLID_STARS stars.
import type { SupabaseClient } from '@supabase/supabase-js';
import { SOLID_STARS } from './products';

export type BrickState = 'solid' | 'some' | 'gap';
export const TRUSTED_SOURCES = ['catalog', 'search', 'tag'] as const;

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
