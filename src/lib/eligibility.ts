import { site } from '../config/site';

export type GithubFacts = {
  githubId: number;
  handle: string;
  avatarUrl: string;
  accountCreatedAt: string;
  contributions12mo: number;
};

export type RuleId = 'account_age' | 'contributions';
export type RuleResult = { rule: RuleId; pass: boolean; detail: string };

const DAY = 86_400_000;

/** Decides whether a GitHub account counts as a verified builder. Pure: no network, no clock of its own. */
export function checkEligibility(facts: GithubFacts, now: Date): { verified: boolean; results: RuleResult[] } {
  const t = site.eligibility;
  const ageDays = Math.floor((now.getTime() - Date.parse(facts.accountCreatedAt)) / DAY);
  const results: RuleResult[] = [
    {
      rule: 'account_age',
      pass: ageDays >= t.minAccountAgeDays,
      detail: `Your GitHub account is ${ageDays} days old. It needs to be at least ${t.minAccountAgeDays}.`,
    },
    {
      rule: 'contributions',
      pass: facts.contributions12mo >= t.minContributions12mo,
      detail: `Your GitHub profile shows ${facts.contributions12mo} contributions in the last 12 months. It needs at least ${t.minContributions12mo}.`,
    },
  ];
  return { verified: results.every((r) => r.pass), results };
}
