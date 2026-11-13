import { providerOf, type Provider } from './accounts';
import { isAdminIn, parseAdminIds } from './admin';
import type { RawPeople, Report, VisitorDay } from './report';
import { adminClient } from './supabase';

export type Person = {
  id: string;
  /** Which sign-in this account came from. */
  provider: Provider;
  /** Null for a GitLab account. */
  github_id: number | null;
  gitlab_id: number | null;
  handle: string;
  avatar_url: string | null;
  verified: boolean;
  failed_rules: string[];
  checked_at: string | null;
  is_builder: boolean;
  account_created_at: string | null;
  contributions_12mo: number | null;
  x_handle: string | null;
  site_url: string | null;
  joined_at?: string | null;
  created_at?: string;
  /** From the provider at sign-in. */
  name?: string | null;
  bio?: string | null;
  location?: string | null;
  repo_count?: number | null;
  /** Written by the person on their account page. */
  about?: string | null;
  skills?: string[];
  open_to_team?: boolean;
  team_note?: string | null;
  profile_public?: boolean;
  featured_repos?: string[];
  repos?: unknown;
  repos_fetched_at?: string | null;
};

export type Idea = {
  id: string;
  slug: string;
  title: string;
  pitch: string;
  missing: string;
  existing_repos: { fullName: string; url: string; stars: number }[];
  created_at: string;
  /** The poster's GitHub handle. Meaningless when `byPlatform` is true. */
  author: string;
  /** Posted by the platform itself, with no personal author. */
  byPlatform: boolean;
  hearts: number;
  /** The longer write-up, each part optional. */
  problem: string;
  build: string;
  strong: string;
  /** A source for any claim the write-up makes about another product. Always https. */
  sourceUrl: string | null;
};

export type Pledge = {
  id: string;
  display_name: string;
  handle: string;
  /** Where `handle` is a username. */
  provider: Provider;
  amount_cents: number;
  status: string;
  created_at: string;
  kind: 'individual' | 'company';
  /** Typed in by the pledger. Never verified. */
  company_url: string | null;
  /** Typed in by the pledger. Never verified. */
  x_handle: string | null;
  /** The pledger asked not to be named. In public lists the name, handle, X account and website are blanked. */
  anonymous: boolean;
  /** Only present when read for the organizer. Never sent to a public page. */
  email?: string | null;
};

export type Stats = { balanceCents: number; syncedAt: string | null; builders: number; pledgedCents: number; ideas: number };

/** Thrown when the database can't be read, so a page shows "unavailable" instead of a false zero. */
export class DataUnavailableError extends Error {}

function db() {
  const client = adminClient();
  if (!client) throw new DataUnavailableError('not configured');
  return client;
}

export async function getPerson(id: string): Promise<Person | null> {
  const { data, error } = await db().from('people').select('*').eq('id', id).maybeSingle();
  if (error) throw new DataUnavailableError(error.message);
  return (data as Person) ?? null;
}

const toIdea = (i: any): Idea => ({
  id: i.id, slug: i.slug, title: i.title, pitch: i.pitch, missing: i.missing,
  existing_repos: i.existing_repos ?? [], created_at: i.created_at, author: i.author,
  byPlatform: i.by_platform === true, hearts: i.hearts,
  problem: i.problem ?? '', build: i.build ?? '', strong: i.strong ?? '',
  sourceUrl: typeof i.source_url === 'string' && i.source_url.startsWith('https://') ? i.source_url : null,
});

/** Listed ideas, most-hearted first, then newest. Heart counts are computed in the database. */
export async function listIdeas(limit = 200): Promise<Idea[]> {
  const { data, error } = await db()
    .from('idea_totals').select('*').eq('status', 'listed')
    .order('hearts', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new DataUnavailableError(error.message);
  return (data ?? []).map(toIdea);
}

export async function getIdea(slug: string): Promise<Idea | null> {
  const { data, error } = await db().from('idea_totals').select('*').eq('slug', slug).eq('status', 'listed').maybeSingle();
  if (error) throw new DataUnavailableError(error.message);
  return data ? toIdea(data) : null;
}

/** What a public page may know about a pledge: an anonymous one keeps only its amount, kind and date. */
export function publicPledge(p: Pledge): Pledge {
  const { email: _email, ...rest } = p;
  return p.anonymous ? { ...rest, display_name: 'Anonymous', handle: '', x_handle: null, company_url: null } : rest;
}

/**
 * Pledges to the pool, newest first. Listed ones unless other statuses are asked for.
 * Public pages get anonymous pledges with every identifying field blanked and never get an
 * email address. `contact: true` is for the organizer's page only.
 */
export async function listPledges(opts: { statuses?: string[]; limit?: number; contact?: boolean } = {}): Promise<Pledge[]> {
  const q = db()
    .from('pledges')
    .select(`id, display_name, amount_cents, status, created_at, kind, company_url, x_handle, anonymous${opts.contact ? ', email' : ''}, people:person_id(handle, provider)`)
    .in('status', opts.statuses ?? ['listed'])
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 100);
  const { data, error } = await q;
  if (error) throw new DataUnavailableError(error.message);
  const rows: Pledge[] = (data ?? []).map((r: any) => ({
    id: r.id, display_name: r.display_name, handle: r.people?.handle ?? 'unknown', provider: providerOf(r.people),
    amount_cents: r.amount_cents, status: r.status, created_at: r.created_at,
    kind: r.kind === 'company' ? 'company' : 'individual', company_url: r.company_url ?? null, x_handle: r.x_handle ?? null,
    anonymous: r.anonymous === true, ...(opts.contact ? { email: r.email ?? null } : {}),
  }));
  return opts.contact ? rows : rows.map(publicPledge);
}

/** The headline numbers, counted in the database. Throws rather than report a zero it could not verify. */
export async function getStats(): Promise<Stats> {
  const { data, error } = await db().rpc('site_stats');
  if (error || !data) throw new DataUnavailableError(error?.message ?? 'no stats');
  return {
    balanceCents: data.balance_cents ?? 0,
    syncedAt: data.synced_at ?? null,
    builders: data.builders,
    pledgedCents: Number(data.pledged_cents),
    ideas: data.ideas,
  };
}

export type BuilderTile = { handle: string; provider: Provider; avatar_url: string | null; x_handle: string | null; site_url: string | null };

/** Builders, newest first. */
export async function listBuilders(limit = 1000): Promise<BuilderTile[]> {
  const { data, error } = await db().from('people').select('handle, provider, avatar_url, x_handle, site_url').eq('is_builder', true).order('joined_at', { ascending: false }).limit(limit);
  if (error) throw new DataUnavailableError(error.message);
  return (data ?? []).map((b: any) => ({ ...b, provider: providerOf(b) }));
}

export type Sponsor = {
  id: string;
  name: string;
  url: string | null;
  logo_url: string | null;
  amount_cents: number;
  kind: 'pool' | 'bounty';
  status: 'pledged' | 'paid';
  note: string;
  listed: boolean;
};

/** Sponsors, largest first. Only listed ones unless `all` is set (the organizer's view). */
export async function listSponsors(all = false): Promise<Sponsor[]> {
  let q = db().from('sponsors').select('id, name, url, logo_url, amount_cents, kind, status, note, listed')
    .order('amount_cents', { ascending: false }).order('created_at', { ascending: true }).limit(200);
  if (!all) q = q.eq('listed', true);
  const { data, error } = await q;
  if (error) throw new DataUnavailableError(error.message);
  return (data ?? []) as Sponsor[];
}

/** The overview and sources numbers, computed in the database. With `humans`, visitor-days marked as possibly automated are left out. */
export async function getReport(humans = false, days = 30): Promise<Report> {
  const { data, error } = await db().rpc('admin_report', { p_days: days, p_humans: humans });
  if (error || !data) throw new DataUnavailableError(error?.message ?? 'no report');
  return data as Report;
}

/** The most recent visitor-days, newest first, each with its pages and what the visitor did. */
export async function getRecentVisitors(opts: { limit?: number; offset?: number; humans?: boolean } = {}): Promise<{ total: number; rows: VisitorDay[] }> {
  const { data, error } = await db().rpc('recent_visitors', { p_limit: opts.limit ?? 100, p_offset: opts.offset ?? 0, p_humans: opts.humans ?? false });
  if (error || !data) throw new DataUnavailableError(error?.message ?? 'no visitors');
  return data as { total: number; rows: VisitorDay[] };
}

/** Every person and contact with everything they did. Includes email addresses: organizer's pages only. */
export async function getPeople(): Promise<RawPeople> {
  const { data, error } = await db().rpc('admin_people');
  if (error || !data) throw new DataUnavailableError(error?.message ?? 'no people');
  return data as RawPeople;
}

export type ListSummary = { active: number; unsubscribed: number; sources: { label: string; people: number }[]; countries: { label: string; people: number }[] };

/** Email list counts, by where each address came from and by country. No addresses. */
export async function getListSummary(): Promise<ListSummary> {
  const { data, error } = await db().rpc('list_summary');
  if (error || !data) throw new DataUnavailableError(error?.message ?? 'no summary');
  return data as ListSummary;
}

export type SubscriberRow = { email: string; source: string; country: string | null; subscribed_at: string; unsubscribed_at: string | null; token: string };

/** The list itself, for the organizer's export only. Includes addresses. */
export async function listSubscribers(limit = 50_000): Promise<SubscriberRow[]> {
  const { data, error } = await db().from('subscribers').select('email, source, country, subscribed_at, unsubscribed_at, token').order('subscribed_at', { ascending: false }).limit(limit);
  if (error) throw new DataUnavailableError(error.message);
  return data ?? [];
}

export type PanelApplication = { person_id: string; handle: string; provider: Provider; why: string; ties: string; country: string | null; handled: boolean; updated_at: string };
export type OrganizeOffer = { person_id: string; handle: string; provider: Provider; note: string; country: string | null; handled: boolean; updated_at: string };
export type SponsorInquiryRow = {
  id: string; company: string; contact_name: string; email: string; amount_usd: number | null; kind: string;
  message: string; country: string | null; handled: boolean; created_at: string;
};

/** Everything people have sent the organizer, newest first, unhandled before handled. Organizer's page only. */
export async function listIntake(): Promise<{ panel: PanelApplication[]; organize: OrganizeOffer[]; inquiries: SponsorInquiryRow[] }> {
  const [panel, organize, inquiries] = await Promise.all([
    db().from('panel_applications').select('person_id, why, ties, country, handled, updated_at, people:person_id(handle, provider)').order('handled').order('updated_at', { ascending: false }).limit(500),
    db().from('organize_offers').select('person_id, note, country, handled, updated_at, people:person_id(handle, provider)').order('handled').order('updated_at', { ascending: false }).limit(500),
    db().from('sponsor_inquiries').select('id, company, contact_name, email, amount_usd, kind, message, country, handled, created_at').order('handled').order('created_at', { ascending: false }).limit(500),
  ]);
  const failed = panel.error ?? organize.error ?? inquiries.error;
  if (failed) throw new DataUnavailableError(failed.message);
  const withHandle = (r: any) => ({ ...r, handle: r.people?.handle ?? 'unknown', provider: providerOf(r.people), people: undefined });
  return {
    panel: (panel.data ?? []).map(withHandle) as PanelApplication[],
    organize: (organize.data ?? []).map(withHandle) as OrganizeOffer[],
    inquiries: (inquiries.data ?? []) as SponsorInquiryRow[],
  };
}

export type Involvement = { onList: boolean; unsubscribed: boolean; appliedToPanel: boolean; offeredToOrganize: boolean };

/** Which ways of joining a signed-in person has already taken, besides building. */
export async function getInvolvement(personId: string): Promise<Involvement> {
  const [sub, panel, organize] = await Promise.all([
    db().from('subscribers').select('unsubscribed_at').eq('person_id', personId).limit(1).maybeSingle(),
    db().from('panel_applications').select('person_id').eq('person_id', personId).maybeSingle(),
    db().from('organize_offers').select('person_id').eq('person_id', personId).maybeSingle(),
  ]);
  const failed = sub.error ?? panel.error ?? organize.error;
  if (failed) throw new DataUnavailableError(failed.message);
  return {
    onList: Boolean(sub.data && !sub.data.unsubscribed_at),
    unsubscribed: Boolean(sub.data?.unsubscribed_at),
    appliedToPanel: Boolean(panel.data),
    offeredToOrganize: Boolean(organize.data),
  };
}

/** Runs a read and returns null instead of throwing, for pages that can still render without it. */
export async function attempt<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (e) {
    if (e instanceof DataUnavailableError) return null;
    throw e;
  }
}

export const usd = (cents: number) =>
  '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 });

const ADMINS = parseAdminIds(import.meta.env.ADMIN_GITHUB_IDS);
/** True only for the organizer: a signed-in person whose GitHub id is in `ADMIN_GITHUB_IDS`. */
export const isAdmin = (p: Person | null | undefined) => isAdminIn(ADMINS, p);

/**
 * What the organizer has pledged, in cents, read from his own listed pledge like anyone
 * else's. Null when he has none (or no organizer is configured): the site then says nothing
 * about it rather than quote a figure that is not in the database.
 */
export async function getOrganizerPledge(): Promise<number | null> {
  if (!ADMINS.length) return null;
  const who = await db().from('people').select('id').in('github_id', ADMINS);
  if (who.error) throw new DataUnavailableError(who.error.message);
  const ids = (who.data ?? []).map((r) => r.id);
  if (!ids.length) return null;
  const { data, error } = await db().from('pledges').select('amount_cents').in('person_id', ids).eq('status', 'listed');
  if (error) throw new DataUnavailableError(error.message);
  const total = (data ?? []).reduce((sum, r) => sum + r.amount_cents, 0);
  return total > 0 ? total : null;
}

/** Which of these ideas this browser has hearted. */
export async function heartedBy(visitor: string | undefined, ideaIds: string[]): Promise<Set<string>> {
  if (!visitor || !ideaIds.length) return new Set();
  const { data, error } = await db().from('idea_hearts').select('idea_id').eq('visitor', visitor).in('idea_id', ideaIds);
  if (error) throw new DataUnavailableError(error.message);
  return new Set((data ?? []).map((r) => r.idea_id));
}
