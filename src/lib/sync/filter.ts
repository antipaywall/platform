// What keeps junk off the directory. Every threshold is here, in one place, to tune.

import { isBlocked } from '../catalog';

export const THRESHOLDS = {
  /** Fewer stars than this and a repo is not listed, unless it carries the antipaywall topic. */
  minStars: 50,
  /** No push for longer than this and a repo counts as abandoned. */
  maxMonthsSincePush: 18,
  /** A repo with no license is not open source in any useful sense. */
  requireLicense: true,
} as const;

export type RepoFacts = {
  githubId: number;
  fullName: string;
  url: string;
  description: string | null;
  homepage: string | null;
  topics: string[];
  licenseSpdx: string | null;
  licenseName: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  helpWanted: number;
  goodFirst: number;
  archived: boolean;
  fork: boolean;
  pushedAt: string;
  createdAt: string;
  latestReleaseTag: string | null;
  latestReleaseAt: string | null;
};

export type RejectReason = 'no_license' | 'archived' | 'stale' | 'few_stars' | 'blocked' | 'fork';

const MONTH_MS = 30.44 * 24 * 3600 * 1000;

/** Whether a repo may be listed. Blocklisted words and repos are refused before anything else. */
export function passesFilter(r: RepoFacts, blocklist: { repos: readonly string[]; words: readonly string[] }, now: Date): { ok: true } | { ok: false; reason: RejectReason } {
  const text = [r.fullName.replace(/[/_.-]/g, ' '), r.description ?? '', r.topics.join(' ').replace(/-/g, ' ')].join(' ');
  if (blocklist.repos.includes(r.fullName.toLowerCase()) || isBlocked(text, blocklist.words)) return { ok: false, reason: 'blocked' };
  if (r.fork) return { ok: false, reason: 'fork' };
  if (r.archived) return { ok: false, reason: 'archived' };
  if (THRESHOLDS.requireLicense && !r.licenseSpdx && !r.licenseName) return { ok: false, reason: 'no_license' };
  if (now.getTime() - Date.parse(r.pushedAt) > THRESHOLDS.maxMonthsSincePush * MONTH_MS) return { ok: false, reason: 'stale' };
  if (r.stars < THRESHOLDS.minStars && !r.topics.includes('antipaywall')) return { ok: false, reason: 'few_stars' };
  return { ok: true };
}
