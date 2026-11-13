// Hackathon seasons. Season 1 is the hackathon that is already running. Its briefs are the most
// wanted gaps: live while the season is collecting, frozen in season_briefs once it opens.

import type { SupabaseClient } from '@supabase/supabase-js';
import { demandFor } from './gaps';

/** Prize shares in percent, by place. Matches the rules: nine winners with Community Choice. */
export const PRIZES = [30, 18, 12, 6, 6, 6, 6, 6] as const;
export const COMMUNITY_CHOICE_PERCENT = 10;
export const BRIEF_COUNT = 5;

export type SeasonStatus = 'collecting' | 'open' | 'building' | 'voting' | 'done';
export type Brief = { id: string; slug: string; title: string; want: number };

export function pickBriefs(status: SeasonStatus, gaps: Brief[], frozen: { idea_id: string; rank: number }[], count = BRIEF_COUNT): Brief[] {
  if (status !== 'collecting') {
    const byId = new Map(gaps.map((g) => [g.id, g]));
    return [...frozen].sort((a, b) => a.rank - b.rank).map((f) => byId.get(f.idea_id)).filter((g): g is Brief => Boolean(g));
  }
  return [...gaps].sort((a, b) => b.want - a.want).slice(0, count);
}

export async function getSeason(db: SupabaseClient, id = 1): Promise<{ id: number; name: string; status: SeasonStatus; briefs: Brief[]; frozen: boolean } | null> {
  const { data: season } = await db.from('seasons').select('id, name, status').eq('id', id).maybeSingle();
  if (!season) return null;
  const status = season.status as SeasonStatus;
  const frozenRows = status === 'collecting' ? [] : ((await db.from('season_briefs').select('idea_id, rank').eq('season_id', id)).data ?? []);
  const q = db.from('ideas').select('id, slug, title').eq('status', 'listed').is('merged_into', null);
  const { data: ideas } = status === 'collecting' ? await q.limit(500) : await q.in('id', frozenRows.map((f) => f.idea_id));
  const demand = await demandFor(db, (ideas ?? []).map((i) => i.id));
  const gaps = (ideas ?? []).map((i) => ({ id: i.id, slug: i.slug, title: i.title, want: demand.get(i.id)?.want ?? 0 }));
  return { id: season.id, name: season.name, status, briefs: pickBriefs(status, gaps, frozenRows), frozen: status !== 'collecting' };
}
