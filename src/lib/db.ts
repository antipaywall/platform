import { isAdminIn, parseAdminIds } from './admin';
import { adminClient } from './supabase';

export type Person = {
  id: string;
  github_id: number;
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
};

export type Pledge = {
  id: string;
  display_name: string;
  handle: string;
  amount_cents: number;
  status: string;
  created_at: string;
  kind: 'individual' | 'company';
  /** Typed in by the pledger. Never verified. */
  company_url: string | null;
  /** Typed in by the pledger. Never verified. */
  x_handle: string | null;
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

/** Pledges to the pool, newest first. Listed ones unless other statuses are asked for. */
export async function listPledges(opts: { statuses?: string[]; limit?: number } = {}): Promise<Pledge[]> {
  const q = db()
    .from('pledges')
    .select('id, display_name, amount_cents, status, created_at, kind, company_url, x_handle, people:person_id(handle)')
    .in('status', opts.statuses ?? ['listed'])
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 100);
  const { data, error } = await q;
  if (error) throw new DataUnavailableError(error.message);
  return (data ?? []).map((r: any) => ({
    id: r.id, display_name: r.display_name, handle: r.people?.handle ?? 'unknown',
    amount_cents: r.amount_cents, status: r.status, created_at: r.created_at,
    kind: r.kind === 'company' ? 'company' : 'individual', company_url: r.company_url ?? null, x_handle: r.x_handle ?? null,
  }));
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

export async function listBuilders(): Promise<{ handle: string; avatar_url: string | null; x_handle: string | null; site_url: string | null }[]> {
  const { data, error } = await db().from('people').select('handle, avatar_url, x_handle, site_url').eq('is_builder', true).order('joined_at', { ascending: false }).limit(1000);
  if (error) throw new DataUnavailableError(error.message);
  return data ?? [];
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

export type Row = { label: string; visitors: number; views: number };
export type Analytics = {
  totals: Record<'today' | 'd7' | 'd30', { visitors: number; views: number }>;
  daily: { day: string; visitors: number; views: number }[];
  pages: Row[];
  referrers: Row[];
  sources: Row[];
  countries: Row[];
  signup_countries: { label: string; people: number; builders: number }[];
  funnel: import('./analytics').FunnelCounts;
};

/** Everything the organizer's dashboard shows, computed in the database. */
export async function getAnalytics(days = 30): Promise<Analytics> {
  const { data, error } = await db().rpc('analytics_summary', { p_days: days });
  if (error || !data) throw new DataUnavailableError(error?.message ?? 'no analytics');
  return data as Analytics;
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

export type PanelApplication = { person_id: string; handle: string; why: string; ties: string; country: string | null; handled: boolean; updated_at: string };
export type OrganizeOffer = { person_id: string; handle: string; note: string; country: string | null; handled: boolean; updated_at: string };
export type SponsorInquiryRow = {
  id: string; company: string; contact_name: string; email: string; amount_usd: number | null; kind: string;
  message: string; country: string | null; handled: boolean; created_at: string;
};

/** Everything people have sent the organizer, newest first, unhandled before handled. Organizer's page only. */
export async function listIntake(): Promise<{ panel: PanelApplication[]; organize: OrganizeOffer[]; inquiries: SponsorInquiryRow[] }> {
  const [panel, organize, inquiries] = await Promise.all([
    db().from('panel_applications').select('person_id, why, ties, country, handled, updated_at, people:person_id(handle)').order('handled').order('updated_at', { ascending: false }).limit(500),
    db().from('organize_offers').select('person_id, note, country, handled, updated_at, people:person_id(handle)').order('handled').order('updated_at', { ascending: false }).limit(500),
    db().from('sponsor_inquiries').select('id, company, contact_name, email, amount_usd, kind, message, country, handled, created_at').order('handled').order('created_at', { ascending: false }).limit(500),
  ]);
  const failed = panel.error ?? organize.error ?? inquiries.error;
  if (failed) throw new DataUnavailableError(failed.message);
  const withHandle = (r: any) => ({ ...r, handle: r.people?.handle ?? 'unknown', people: undefined });
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
