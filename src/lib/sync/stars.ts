// Star history without downloading every star. GitHub's stargazer list can give the date of
// each star, 100 to a page, and lets you jump to any page up to 400. Reading a page tells you
// when star number (page-1)*100+1 arrived, so about 15 evenly spread pages draw the whole curve.
// Above 40,000 stars the curve is exact to 40,000 and then runs to today's total.

export const MAX_PAGES = 400;
export const PER_PAGE = 100;

/** The stargazer pages to read for a repo with this many stars: every page when there are few. */
export function samplePages(totalStars: number, samples = 15): number[] {
  if (totalStars <= 0) return [];
  const last = Math.min(Math.ceil(totalStars / PER_PAGE), MAX_PAGES);
  if (last <= samples) return Array.from({ length: last }, (_, i) => i + 1);
  const pages = new Set<number>();
  for (let i = 0; i < samples; i++) pages.add(1 + Math.round((i * (last - 1)) / (samples - 1)));
  return [...pages].sort((a, b) => a - b);
}

export type StarPoint = [string, number];

/** One point per sampled page, plus today at the real total. Dates are YYYY-MM-DD. */
export function starPointsFromSamples(samples: { page: number; firstStarredAt: string }[], total: number, now: Date): StarPoint[] {
  const points: StarPoint[] = samples
    .filter((s) => !Number.isNaN(Date.parse(s.firstStarredAt)))
    .sort((a, b) => a.page - b.page)
    .map((s) => [s.firstStarredAt.slice(0, 10), (s.page - 1) * PER_PAGE + 1]);
  const today = now.toISOString().slice(0, 10);
  if (points.at(-1)?.[0] === today) points.pop();
  points.push([today, total]);
  return points;
}
