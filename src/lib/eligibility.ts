import { site } from '../config/site';
import { providerName, type Provider } from './accounts';

/** What the rules read from the account someone signed in with. */
export type AccountFacts = {
  provider: Provider;
  /** The provider's own numeric account id. */
  accountId: number;
  handle: string;
  avatarUrl: string;
  accountCreatedAt: string;
  contributions12mo: number;
};

export type RuleId = 'account_age' | 'contributions';
export type RuleResult = { rule: RuleId; pass: boolean; detail: string };

const DAY = 86_400_000;

/** Decides whether a GitHub or GitLab account counts as a verified builder. Pure: no network, no clock of its own. */
export function checkEligibility(facts: AccountFacts, now: Date): { verified: boolean; results: RuleResult[] } {
  const t = site.eligibility;
  const name = providerName(facts.provider);
  const ageDays = Math.floor((now.getTime() - Date.parse(facts.accountCreatedAt)) / DAY);
  const results: RuleResult[] = [
    {
      rule: 'account_age',
      pass: ageDays >= t.minAccountAgeDays,
      detail: `Your ${name} account is ${ageDays} days old. It needs to be at least ${t.minAccountAgeDays}.`,
    },
    {
      rule: 'contributions',
      pass: facts.contributions12mo >= t.minContributions12mo,
      detail:
        `Your ${name} profile shows ${facts.contributions12mo} contributions in the last 12 months. It needs at least ${t.minContributions12mo}.` +
        (facts.provider === 'gitlab' ? ' GitLab only shows them while your profile is public.' : ''),
    },
  ];
  return { verified: results.every((r) => r.pass), results };
}
