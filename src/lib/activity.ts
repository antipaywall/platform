// The activity wall: a year of daily contributions, counted two ways. "Public" counts commits,
// pull requests, issues and reviews on public repositories only. "All" is what GitHub's own
// chart counts, including private work the person chose to show. GitLab only ever shows
// public activity to others, so for GitLab both are the same.

import type { Provider } from './accounts';

/** Sparse daily counts: "2026-11-12" -> 4. Days with nothing are left out. */
export type DayCounts = Record<string, number>;
export type Activity = { public: DayCounts; all: DayCounts };

export class ActivityUnavailableError extends Error {}

const DAY = 86_400_000;
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);

const add = (into: DayCounts, iso: unknown, n = 1) => {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(iso) || !(n > 0)) return;
  const d = iso.slice(0, 10);
  into[d] = (into[d] ?? 0) + n;
};

async function graphql(token: string, query: string, variables: Record<string, unknown>, f: typeof fetch): Promise<any> {
  const res = await f('https://api.github.com/graphql', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'antipaywall' },
    body: JSON.stringify({ query, variables }),
  }).catch(() => null);
  if (!res || !res.ok) throw new ActivityUnavailableError(res ? `status ${res.status}` : 'network');
  const body = (await res.json().catch(() => null)) as any;
  if (!body?.data?.user) throw new ActivityUnavailableError('no user');
  return body.data.user;
}

const CALENDAR = `query($login: String!) { user(login: $login) { contributionsCollection {
  contributionCalendar { weeks { contributionDays { date contributionCount } } } } } }`;

// One quarter at a time keeps each list under GitHub's 100-item page for almost everyone.
const PUBLIC = `query($login: String!, $from: DateTime!, $to: DateTime!) { user(login: $login) {
  contributionsCollection(from: $from, to: $to) {
    commitContributionsByRepository(maxRepositories: 100) { repository { isPrivate } contributions(first: 100) { nodes { occurredAt commitCount } } }
    pullRequestContributions(first: 100) { nodes { occurredAt pullRequest { repository { isPrivate } } } }
    issueContributions(first: 100) { nodes { occurredAt issue { repository { isPrivate } } } }
    pullRequestReviewContributions(first: 100) { nodes { occurredAt pullRequestReview { repository { isPrivate } } } } } } }`;

/** Reads a GitHub account's last year, both ways. Any token can read anyone's public activity. */
export async function fetchGithubActivity(login: string, token: string, now: Date, f: typeof fetch = fetch): Promise<Activity> {
  const end = now.getTime();
  const quarters = [0, 1, 2, 3].map((i) => ({ from: new Date(end - (4 - i) * 91.5 * DAY).toISOString(), to: new Date(end - (3 - i) * 91.5 * DAY).toISOString() }));
  const [cal, ...parts] = await Promise.all([
    graphql(token, CALENDAR, { login }, f),
    ...quarters.map((q) => graphql(token, PUBLIC, { login, ...q }, f)),
  ]);
  const all: DayCounts = {};
  for (const w of cal.contributionsCollection?.contributionCalendar?.weeks ?? []) {
    for (const d of w.contributionDays ?? []) add(all, d.date, Number(d.contributionCount));
  }
  const pub: DayCounts = {};
  for (const u of parts) {
    const c = u.contributionsCollection ?? {};
    for (const r of c.commitContributionsByRepository ?? []) {
      if (r.repository?.isPrivate !== false) continue;
      for (const n of r.contributions?.nodes ?? []) add(pub, n.occurredAt, Number(n.commitCount));
    }
    for (const [list, inner] of [['pullRequestContributions', 'pullRequest'], ['issueContributions', 'issue'], ['pullRequestReviewContributions', 'pullRequestReview']] as const) {
      for (const n of c[list]?.nodes ?? []) if (n[inner]?.repository?.isPrivate === false) add(pub, n.occurredAt);
    }
  }
  return { public: pub, all };
}

/** GitLab's public calendar. What others see on GitLab is public activity only. */
export async function fetchGitlabActivity(username: string, f: typeof fetch = fetch): Promise<Activity> {
  const res = await f(`https://gitlab.com/users/${encodeURIComponent(username)}/calendar.json`, { headers: { accept: 'application/json', 'user-agent': 'antipaywall' } }).catch(() => null);
  if (!res || !res.ok) throw new ActivityUnavailableError(res ? `status ${res.status}` : 'network');
  const days = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!days || typeof days !== 'object' || Array.isArray(days)) throw new ActivityUnavailableError('not a calendar');
  const out: DayCounts = {};
  for (const [d, n] of Object.entries(days)) if (/^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isSafeInteger(n)) add(out, d, n as number);
  return { public: out, all: { ...out } };
}

export async function fetchActivity(who: { provider: Provider; handle: string }, opts: { token?: string; now?: Date; fetchImpl?: typeof fetch }): Promise<Activity> {
  const now = opts.now ?? new Date();
  if (who.provider === 'gitlab') return fetchGitlabActivity(who.handle, opts.fetchImpl);
  if (!opts.token) throw new ActivityUnavailableError('no token');
  return fetchGithubActivity(who.handle, opts.token, now, opts.fetchImpl);
}

/** Reads the saved copy off a row. Anything malformed counts as nothing. */
export function savedActivity(raw: unknown): Activity {
  const clean = (v: unknown): DayCounts => {
    const out: DayCounts = {};
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [d, n] of Object.entries(v)) if (/^\d{4}-\d{2}-\d{2}$/.test(d) && typeof n === 'number' && Number.isSafeInteger(n) && n > 0) out[d] = n;
    }
    return out;
  };
  const r = (raw ?? {}) as Record<string, unknown>;
  return { public: clean(r.public), all: clean(r.all) };
}

export type Brick = { x: number; y: number; level: 0 | 1 | 2 | 3 | 4; day: string; count: number };
export type Wall = { bricks: Brick[]; width: number; height: number; total: number; activeDays: number; days: number; longestStreak: number; busiest: { day: string; count: number } | null };

/** Brick size, gap, and the half-brick shift on every other row. */
export const BRICK = { w: 10, h: 6, gap: 2 };

/**
 * Lays out the 365 days ending on `now` as brickwork: weeks left to right, Sunday at the top,
 * every other row shifted half a brick. Levels split the active days into quarters, so a quiet
 * builder's busiest days still show as busy.
 */
export function buildWall(counts: DayCounts, now: Date): Wall {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const start = end - 364 * DAY;
  const days: { day: string; count: number }[] = [];
  for (let t = start; t <= end; t += DAY) days.push({ day: ymd(t), count: counts[ymd(t)] ?? 0 });
  const active = days.map((d) => d.count).filter((n) => n > 0).sort((a, b) => a - b);
  const q = (p: number) => active[Math.floor((active.length - 1) * p)] ?? 1;
  const cut = [q(0.25), q(0.5), q(0.8)];
  const level = (n: number): Brick['level'] => (n === 0 ? 0 : n <= cut[0] ? 1 : n <= cut[1] ? 2 : n <= cut[2] ? 3 : 4);
  const { w, h, gap } = BRICK;
  const firstDow = new Date(start).getUTCDay();
  let cols = 0, streak = 0, longest = 0;
  let busiest: Wall['busiest'] = null;
  const bricks = days.map((d, i) => {
    const k = i + firstDow, col = Math.floor(k / 7), row = k % 7;
    cols = Math.max(cols, col);
    streak = d.count > 0 ? streak + 1 : 0;
    longest = Math.max(longest, streak);
    if (d.count > 0 && (!busiest || d.count > busiest.count)) busiest = { day: d.day, count: d.count };
    return { x: col * (w + gap) + (row % 2 ? (w + gap) / 2 : 0), y: row * (h + gap), level: level(d.count), day: d.day, count: d.count };
  });
  return {
    bricks,
    width: (cols + 1) * (w + gap) + (w + gap) / 2 - gap,
    height: 7 * (h + gap) - gap,
    total: days.reduce((s, d) => s + d.count, 0),
    activeDays: active.length,
    days: days.length,
    longestStreak: longest,
    busiest,
  };
}
