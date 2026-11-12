// The one place the name, thresholds and external identifiers live.
export const site = {
  name: 'Antipaywall',
  // Where the site lives. Used for canonical links, the sitemap and social cards.
  origin: 'https://www.antipaywall.org',
  // Where this site's code can be read.
  repo: 'https://github.com/antipaywall/platform',
  // The length of the event is fixed. Its dates are announced later.
  shape: { buildDays: 7, votingDays: 3 },
  // Two checks, both read from the GitHub or GitLab profile at sign-in. They make throwaway accounts
  // more expensive to create. They are not proof of identity and do not claim to be.
  eligibility: { minAccountAgeDays: 30, minContributions12mo: 10 },
  // The dates are announced once at least this many builders have joined and the pool holder
  // is confirmed. It is a threshold, not a cap: there is no limit on how many can join.
  launch: { buildersNeeded: 100 },
  // A pledge is only a promise, so one above this amount is checked by hand before it is listed.
  pledgeHold: { aboveUsd: 1000 },
  ideas: { maxPerPerson: 5 },
  rules: { version: '1.0', date: 'November 12, 2026' },
  sponsorTiersUsd: [250, 1000, 5000],
  fees: { hostPercent: 10 },
  collective: {
    slug: import.meta.env.PUBLIC_COLLECTIVE_SLUG ?? '',
    host: 'Open Source Collective',
    pending: (import.meta.env.PUBLIC_COLLECTIVE_PENDING ?? 'true') !== 'false',
  },
} as const;

const dollars = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 });

/** The rules version as it is shown and as it is stored when someone accepts them. */
export const rulesVersion = `${site.rules.version} (${site.rules.date})`;

/**
 * What the organizer has pledged, in words. The amount is passed in from his pledge in the
 * database: nothing here knows a figure of its own.
 */
export const organizerPledge = (cents: number) => `${dollars(cents / 100)}, from his own money`;

/** The same pledge as full sentences, for pages that explain it. */
export const organizerPledgeFull = (cents: number) =>
  `The organizer has pledged ${dollars(cents / 100)} to the pool, from his own money. He is also doing the work of bringing in sponsors, including asking them to cover the pool holder's fee. He takes nothing out.`;

/** The shape of the event. The dates are not announced yet, and the site never implies they are. */
export const shape = {
  build: `${site.shape.buildDays} days to build`,
  vote: `${site.shape.votingDays} days of voting`,
  summary: `One week to build, ${site.shape.votingDays} days of voting, winners announced the day after, paid in public.`,
  when: `The dates are announced as soon as ${site.launch.buildersNeeded}+ builders have joined and the pool holder is confirmed. There is no cap on builders.`,
};

/** How a sponsor bounty is decided. One wording for the sponsor page, the rules and the questions page. */
export const bountyRules = [
  'The sponsor writes the criteria before the bounty is listed. They cannot be changed afterwards.',
  "Antipaywall's review panel decides which entries meet those criteria.",
  'The sponsor picks the winner from the eligible entries, by a deadline set when the bounty is listed.',
  'If the sponsor does not pick in time, the eligible entry with the most builder votes wins.',
  'If no entry is eligible, the money goes to the main pool.',
  'A sponsor cannot withdraw a bounty once it is listed.',
];

/**
 * What applies to the people running it. One wording for the rules, the questions page and About.
 * These are rules, not features: entries and votes are handled by parts of the site still to come.
 */
export const insiderRules = [
  'Organizers and review panel members are welcome to build an entry, and encouraged to.',
  `Their entries are shown with everyone else's and count toward the builders the dates are waiting on.`,
  'Their entries cannot win a prize or a bounty, and are not on the main ballot.',
  'They do not vote on the main prizes.',
  'Like anyone whose GitHub or GitLab account passes the two checks, they can vote for Community Choice.',
];

const host = site.collective.host;
const pct = site.fees.hostPercent;
const pending = site.collective.pending;

/**
 * The one wording for who gets what, used everywhere money comes up, so no two pages can
 * say different things about it.
 *
 * While the pool is not open (`pending`): the holder we have chosen is named, with its fee,
 * and the wording is plain that it is confirmed on this site before anyone can pay in.
 * Once it is open: the holder is stated as a fact.
 */
export const money = pending
  ? {
      none: 'Antipaywall takes nothing: no cut, no fee, no profit.',
      full: `Antipaywall takes nothing: no cut, no fee, no profit. We never hold the money: an independent nonprofit will. Our choice is ${host}, which keeps ${pct}% of each contribution for doing that, and the card processor takes its own fee. We are asking sponsors to cover that ${pct}%, so what people give reaches the pool whole. The holder and its fee are confirmed here before anyone can pay in.`,
      short: `Antipaywall takes nothing and never holds the money. Our choice to hold it is ${host}, a nonprofit that keeps ${pct}% for that service; we are asking sponsors to cover it. It is confirmed here before anyone can pay in.`,
      holder: `An independent nonprofit, never Antipaywall or its organizer. Our choice is ${host}, which keeps ${pct}% for that service. It is confirmed here before anyone can pay in.`,
    }
  : {
      none: 'Antipaywall takes nothing: no cut, no fee, no profit.',
      full: `Antipaywall takes nothing: no cut, no fee, no profit. ${host}, the independent nonprofit that holds the money, keeps ${pct}% of each contribution to cover its own costs, and the card processor takes its fee. Everything else is the prize pool.`,
      short: `Antipaywall takes nothing. ${host}, the independent nonprofit holding the money, keeps ${pct}% for its costs, and the card processor takes its fee.`,
      holder: `${host}, an independent nonprofit, holds the pool. Antipaywall and its organizer never hold it and never take a cut.`,
    };
