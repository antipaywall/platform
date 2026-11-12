import { EVENT_LABELS, type EventKind } from './events';
import { profileUrl, providerName, providerOf, type Provider } from './accounts';
import { sourceName } from './sources';

// Shapes and small sums for the organizer's pages. The numbers themselves are computed in the
// database (supabase/migrations/0013_attribution.sql); nothing here touches it.

export type Totals = { visitors: number; views: number; converted: number; automated: number; events: Partial<Record<EventKind, number>> };
export type Counted = { label: string; visitors: number; views: number; converted?: number };
export type SourceRow = Counted & { converted: number; hosts: string[]; campaigns: string[]; events: Partial<Record<EventKind, number>> };
export type Report = {
  totals: Record<'today' | 'yesterday' | 'd7' | 'd30', Totals>;
  hourly: { at: string; visitors: number; views: number }[];
  daily: { day: string; visitors: number; views: number; converted: number }[];
  sources: SourceRow[];
  landings: Counted[];
  pages: Counted[];
  countries: Counted[];
  devices: Counted[];
};

export type Automated = 'fast' | 'inner' | 'burst';
export type PageHit = { at: string; path: string };
export type Did = { at: string; kind: EventKind; subject: string | null };
export type VisitorDay = {
  day: string; visitor: string; first_at: string; last_at: string; views: number; landing: string;
  country: string | null; device: string | null; referrer_host: string | null;
  utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; utm_content: string | null;
  source: string; pages: PageHit[]; events: Did[]; signups: number; automated: Automated | null;
};

/** Why a visitor-day is marked as possibly automated, in plain words. */
export const AUTOMATED_NOTES: Record<Automated, string> = {
  fast: 'Three or more pages, less than a second apart on average: faster than a person clicks.',
  inner: 'One page only, straight onto an inner page, with no referring site and no tag, and nothing done afterwards. Crawlers that pretend to be browsers look like this; so does someone who opened a link you sent them and left.',
  burst: 'One view of the homepage only, with no referring site and no tag, at the same minute as at least four others like it from the same country.',
};

/** Share of visitors who signed up for something, as a percentage with one decimal. Null when there were no visitors. */
export function conversion(converted: number, visitors: number): number | null {
  return visitors > 0 ? Math.round((converted / visitors) * 1000) / 10 : null;
}

/** "12.5%", or a dash when there is nothing to divide by. */
export const percent = (converted: number, visitors: number) => {
  const c = conversion(converted, visitors);
  return c === null ? '–' : `${c}%`;
};

/** The change from one count to the next, for "today against yesterday". Null when there is nothing to compare with. */
export function change(now: number, before: number): { text: string; up: boolean } | null {
  if (before <= 0) return null;
  const pct = Math.round(((now - before) / before) * 100);
  return { text: `${pct > 0 ? '+' : ''}${pct}% on yesterday`, up: pct >= 0 };
}

export type Step = { at: string; type: 'page' | 'did'; text: string };

/** Pages and actions of one visitor-day as a single list in time order. On a tie the page comes first: it was open when the action was taken. */
export function timeline(pages: PageHit[], events: { at: string; kind: EventKind; subject?: string | null }[]): Step[] {
  const steps: Step[] = [
    ...pages.map((p) => ({ at: p.at, type: 'page' as const, text: p.path })),
    ...events.map((e) => ({ at: e.at, type: 'did' as const, text: describe(e.kind, e.subject) })),
  ];
  return steps.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || (a.type === b.type ? 0 : a.type === 'page' ? -1 : 1));
}

/** An action in words, with the idea's slug where there is one. Ids are left out: they mean nothing to a reader. */
export function describe(kind: EventKind, subject?: string | null): string {
  const label = EVENT_LABELS[kind] ?? kind;
  return (kind === 'hearted' || kind === 'idea_posted') && subject ? `${label}: ${subject}` : label;
}

/** Where a visitor-day came from, in words: the group, then the tag or site it was read from. */
export function sourceText(v: { source: string; referrer_host: string | null; utm_source: string | null; utm_medium?: string | null; utm_campaign?: string | null }): string {
  const name = sourceName(v.source);
  const via = v.utm_source ? `tag "${v.utm_source}"` : v.referrer_host && v.referrer_host !== name ? v.referrer_host : '';
  const extra = [v.utm_medium && `medium "${v.utm_medium}"`, v.utm_campaign && `campaign "${v.utm_campaign}"`].filter(Boolean);
  return [name, [via, ...extra].filter(Boolean).join(', ')].filter(Boolean).map((s, i) => (i ? `(${s})` : s)).join(' ');
}

// People

export type ActionEvent = { at: string; kind: EventKind; subject: string | null; day: string; visitor: string | null; untracked: boolean };
export type Journey = Pick<VisitorDay, 'day' | 'visitor' | 'first_at' | 'landing' | 'source' | 'referrer_host' | 'utm_source' | 'utm_medium' | 'utm_campaign' | 'device' | 'country' | 'views' | 'pages'>;
export type RawPeople = {
  people: {
    id: string; handle: string; provider?: string | null; github_id: number | null; verified: boolean; failed_rules: string[]; is_builder: boolean;
    country: string | null; created_at: string; joined_at: string | null; last_at: string;
    emails: { email: string; source: string; subscribed_at: string; unsubscribed_at: string | null }[];
    pledges: { amount_cents: number; status: string; name: string; at: string }[];
    ideas: { slug: string; title: string; at: string }[];
    panel: boolean; organize: boolean; events: ActionEvent[];
  }[];
  contacts: {
    email: string; last_at: string;
    list: { source: string; country: string | null; subscribed_at: string; unsubscribed_at: string | null } | null;
    inquiries: { company: string; contact: string; kind: string; amount_usd: number | null; country: string | null; at: string }[];
    events: ActionEvent[];
  }[];
  journeys: Journey[];
};

export const PEOPLE_FILTERS = [
  ['all', 'Everyone'], ['account', 'Signed in'], ['builder', 'Builders'], ['list', 'Email list'], ['pledge', 'Pledged'],
  ['idea', 'Posted an idea'], ['panel', 'Review panel'], ['organize', 'Organize'], ['sponsor', 'Sponsor inquiry'],
] as const;
export type PeopleFilter = (typeof PEOPLE_FILTERS)[number][0];

export type Entry = {
  key: string;
  /** A GitHub or GitLab account, or an address with no account. */
  type: 'account' | 'contact';
  handle: string | null;
  /** Where `handle` is a username. Null for an address with no account. */
  provider: Provider | null;
  emails: { email: string; subscribed: boolean; source: string }[];
  country: string | null;
  firstAt: string;
  lastAt: string;
  /** Everything they signed up for, in words. */
  signedUpFor: string[];
  /** Which filters this entry belongs under. */
  is: PeopleFilter[];
  checks: string | null;
  events: ActionEvent[];
  /** The visitor-days behind their actions, oldest first. Empty when every action predates journey tracking. */
  journeys: Journey[];
};

const money = (cents: number) => '$' + Math.round(cents / 100).toLocaleString('en-US');

/** One entry per person: an account with everything tied to it, or an address with no account. Newest activity first. */
export function buildEntries(raw: RawPeople): Entry[] {
  const byKey = new Map(raw.journeys.map((j) => [`${j.day}|${j.visitor}`, j]));
  const journeysOf = (events: ActionEvent[]) => {
    const keys = [...new Set(events.filter((e) => e.visitor).map((e) => `${e.day}|${e.visitor}`))];
    return keys.map((k) => byKey.get(k)).filter((j): j is Journey => Boolean(j)).sort((a, b) => Date.parse(a.first_at) - Date.parse(b.first_at));
  };
  const accounts: Entry[] = raw.people.map((p) => {
    const onList = p.emails.some((e) => !e.unsubscribed_at);
    const live = p.pledges.filter((g) => g.status !== 'hidden');
    const is: PeopleFilter[] = ['all', 'account'];
    const provider = providerOf(p);
    const for_: string[] = [`Signed in with ${providerName(provider)}`];
    if (p.is_builder) { is.push('builder'); for_.push('Builder'); }
    if (p.emails.length) { is.push('list'); for_.push(onList ? 'Email list' : 'Email list (unsubscribed)'); }
    if (live.length) { is.push('pledge'); for_.push(`Pledged ${money(live[0].amount_cents)} (${live[0].status})`); }
    if (p.ideas.length) { is.push('idea'); for_.push(p.ideas.length === 1 ? 'Posted an idea' : `Posted ${p.ideas.length} ideas`); }
    if (p.panel) { is.push('panel'); for_.push('Applied to the review panel'); }
    if (p.organize) { is.push('organize'); for_.push('Offered to help organize'); }
    return {
      key: p.id, type: 'account', handle: p.handle, provider,
      emails: p.emails.map((e) => ({ email: e.email, subscribed: !e.unsubscribed_at, source: e.source })),
      country: p.country, firstAt: p.created_at, lastAt: p.last_at, signedUpFor: for_, is,
      checks: p.verified ? 'Passed the builder checks' : `Did not pass: ${p.failed_rules.join(', ') || 'not checked'}`,
      events: p.events, journeys: journeysOf(p.events),
    };
  });
  const contacts: Entry[] = raw.contacts.map((c) => {
    const is: PeopleFilter[] = ['all'];
    const for_: string[] = [];
    if (c.list) { is.push('list'); for_.push(c.list.unsubscribed_at ? 'Email list (unsubscribed)' : 'Email list'); }
    for (const q of c.inquiries) for_.push(`Sponsor inquiry from ${q.company}${q.amount_usd ? `, about $${q.amount_usd.toLocaleString('en-US')}` : ''}`);
    if (c.inquiries.length) is.push('sponsor');
    const times = [c.list?.subscribed_at, ...c.inquiries.map((q) => q.at)].filter((t): t is string => Boolean(t)).sort();
    return {
      key: c.email, type: 'contact', handle: null, provider: null,
      emails: [{ email: c.email, subscribed: Boolean(c.list && !c.list.unsubscribed_at), source: c.list?.source ?? 'sponsor form' }],
      country: c.list?.country ?? c.inquiries[0]?.country ?? null, firstAt: times[0] ?? c.last_at, lastAt: c.last_at,
      signedUpFor: for_, is, checks: null, events: c.events, journeys: journeysOf(c.events),
    };
  });
  return [...accounts, ...contacts].sort((a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt));
}

/** Narrows the list by what people signed up for and by a handle or address. */
export function filterEntries(entries: Entry[], opts: { kind?: string | null; q?: string | null }): Entry[] {
  const kind = PEOPLE_FILTERS.find(([k]) => k === opts.kind)?.[0] ?? 'all';
  const q = (opts.q ?? '').trim().toLowerCase().replace(/^@/, '').slice(0, 100);
  return entries.filter((e) => e.is.includes(kind) && (!q || (e.handle ?? '').toLowerCase().includes(q) || e.emails.some((m) => m.email.includes(q))));
}

export const PEOPLE_CSV_HEADER = ['who', 'type', 'profile', 'emails', 'on_email_list', 'signed_up_for', 'builder_checks', 'country', 'first_seen', 'last_activity', 'source', 'landing_page', 'device', 'pages_viewed'];

/** One row per entry, for the export. Attribution comes from the earliest visitor-day there is for them. */
export function peopleCsvRows(entries: Entry[]): string[][] {
  return entries.map((e) => {
    const j = e.journeys[0];
    return [
      e.handle ?? e.emails[0]?.email ?? '', e.provider ? `${providerName(e.provider)} account` : 'address only',
      e.handle && e.provider ? profileUrl(e.provider, e.handle) : '', e.emails.map((m) => m.email).join('; '),
      e.emails.some((m) => m.subscribed) ? 'yes' : 'no', e.signedUpFor.join('; '), e.checks ?? '', e.country ?? '',
      e.firstAt, e.lastAt, j ? sourceText(j) : '', j?.landing ?? '', j?.device ?? '', j ? j.pages.map((p) => p.path).join(' > ') : '',
    ];
  });
}

// Charts: plain numbers for an inline SVG, so no script is needed.

/** Bars for a series, scaled to the tallest one. A bar with anything in it is at least two units high so it can be seen. */
export function bars(values: number[], width: number, height: number): { x: number; y: number; w: number; h: number }[] {
  const peak = Math.max(1, ...values);
  const step = values.length ? width / values.length : 0;
  return values.map((v, i) => {
    const h = Math.max(v ? 2 : 0, (v / peak) * (height - 8));
    return { x: round(i * step + (step > 3 ? 1 : 0)), y: round(height - h), w: round(Math.max(1, step - (step > 3 ? 2 : 0))), h: round(h) };
  });
}
const round = (n: number) => Math.round(n * 100) / 100;
