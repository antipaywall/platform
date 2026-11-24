// Badges: little painted bricks. The organizer gives the team ones; the rest are earned by
// doing something and are worked out from the person's row, never stored.

export type BadgeKind = 'founder' | 'organizer' | 'panel' | 'sponsor' | 'winner' | 'builder' | 'season' | 'backer';
export type Badge = { kind: BadgeKind; label: string; detail: string; season?: number | null; place?: number | null };
export type GrantedBadge = { kind: 'founder' | 'organizer' | 'panel' | 'sponsor' | 'winner'; season: number | null; place: number | null; note: string | null };

/** The order badges are shown in. The first one a person has sits next to their name. */
export const BADGE_ORDER: readonly BadgeKind[] = ['founder', 'organizer', 'panel', 'sponsor', 'winner', 'builder', 'season', 'backer'];

/** What each badge means, in plain words. */
export const BADGE_INFO: Record<BadgeKind, { label: string; detail: string }> = {
  founder: { label: 'Founding organizer', detail: 'Started Antipaywall.' },
  organizer: { label: 'Organizer', detail: 'Runs the hackathon.' },
  panel: { label: 'Review panel', detail: 'A named volunteer who checks entries and hears appeals.' },
  sponsor: { label: 'Sponsor', detail: 'Backs the pool or a bounty.' },
  winner: { label: 'Winner', detail: 'Placed in a season.' },
  builder: { label: 'Builder', detail: 'Passed the two checks: a real account at least 30 days old, with real activity.' },
  season: { label: 'Season 1 builder', detail: 'Started their Season 1 entry.' },
  backer: { label: 'Backer', detail: 'Backs what they want built, or pledged to the pool.' },
};

const ordinal = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);

/** Everything a person has earned or been given, most important first. */
/** The badge for someone who joined Season 1 but hasn't started an entry yet. */
export const INTERESTED = { label: 'Interested in Season 1', detail: 'Joined the Season 1 hackathon. Becomes a Season 1 builder once their entry repo is started.' };

export function badgesFor(p: { verified?: boolean; is_builder?: boolean }, granted: readonly GrantedBadge[], opts: { backer?: boolean; entry?: boolean } = {}): Badge[] {
  const out: Badge[] = [];
  for (const g of granted) {
    const info = BADGE_INFO[g.kind];
    if (g.kind === 'winner' && g.season) {
      out.push({ kind: 'winner', label: `${g.place ? ordinal(g.place) + ', ' : ''}Season ${g.season}`, detail: 'Placed in this season.', season: g.season, place: g.place });
    } else if (info) {
      out.push({ kind: g.kind, label: info.label, detail: g.note ?? info.detail });
    }
  }
  if (p.verified) out.push({ kind: 'builder', ...BADGE_INFO.builder });
  if (opts.entry) out.push({ kind: 'season', ...BADGE_INFO.season, season: 1 });
  else if (p.is_builder) out.push({ kind: 'season', ...INTERESTED, season: 1 });
  if (opts.backer) out.push({ kind: 'backer', ...BADGE_INFO.backer });
  const seen = new Set<string>();
  return out
    .filter((b) => {
      const key = `${b.kind}:${b.season ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => BADGE_ORDER.indexOf(a.kind) - BADGE_ORDER.indexOf(b.kind));
}

/** The one badge shown next to a name, or null. */
export const topBadge = (badges: readonly Badge[]): Badge | null => badges[0] ?? null;
