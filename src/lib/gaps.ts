// Gaps: things people want that don't exist yet, or that existing projects don't do. They are
// the `ideas` rows. A gap can be merged into another (same wish, different words), claimed by
// builders (never exclusively), followed, and backed with hearts and signals.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Provider } from './accounts';
import { providerOf } from './accounts';
import type { MessageCode } from './respond';
import { signalsOf, type SignalKind, type PayPeriod } from './signals';

export const BUILD_STATUS = {
  wanted: { label: 'Nobody has built it yet', dot: 'pf-dot-marigold' },
  building: { label: 'Being built', dot: 'pf-dot-tomato' },
  exists: { label: 'Exists now', dot: '' },
} as const;
export type BuildStatus = keyof typeof BUILD_STATUS;

/** How many distinct backers a gap has once the gaps merged into it are added. Keys are demandKey()s. */
export function mergeCounts(target: string[], merged: string[][]): number {
  return new Set([...target, ...merged.flat()]).size;
}

/** What a gap's address should do: show it, send to the gap it was merged into, or not exist. */
export function whereTo(row: { slug: string; merged_into_slug: string | null; status: string }): { redirect: string } | { show: true } | { missing: true } {
  if (row.status !== 'listed') return { missing: true };
  if (row.merged_into_slug) return { redirect: `/ideas/${row.merged_into_slug}` };
  return { show: true };
}

export function parseClaim(form: FormData): { ok: true; note: string | null; repoUrl: string | null } | { ok: false; code: MessageCode } {
  const note = String(form.get('note') ?? '').replace(/\s+/g, ' ').trim();
  const repo = String(form.get('repo_url') ?? '').trim();
  if (note.length > 140) return { ok: false, code: 'bad_claim_note' };
  if (repo && !/^https:\/\/(github|gitlab)\.com\/[\w.-]+\/[\w.-]+\/?$/.test(repo)) return { ok: false, code: 'bad_repo_url' };
  return { ok: true, note: note || null, repoUrl: repo || null };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export type FollowKind = 'gap' | 'project' | 'tool' | 'topic';

export function parseFollow(form: FormData): { ok: true; kind: FollowKind; id: string; on: boolean } | { ok: false } {
  const kind = String(form.get('subject_kind') ?? '');
  const id = String(form.get('subject_id') ?? '');
  if (!['gap', 'project', 'tool', 'topic'].includes(kind) || !UUID.test(id)) return { ok: false };
  return { ok: true, kind: kind as FollowKind, id, on: form.get('on') === '1' };
}

/** Splitting a merge is for builders (a GitHub or GitLab account) and the organizer, since it blocks the pair for good. */
export const canUnmerge = (who: { person: boolean; admin: boolean }) => who.person || who.admin;

export type Demand = { want: number; pay: number; payMonthCents: number; payOnceCents: number; test: number };
const noDemand: Demand = { want: 0, pay: 0, payMonthCents: 0, payOnceCents: 0, test: 0 };

/** Demand for many gaps at once, merged gaps folded in. */
export async function demandFor(db: SupabaseClient, ids: string[]): Promise<Map<string, Demand>> {
  const out = new Map<string, Demand>();
  if (!ids.length) return out;
  const { data, error } = await db.rpc('gap_demand', { p_ids: ids });
  if (error) throw new Error(error.message);
  for (const r of (data ?? []) as any[]) {
    out.set(r.idea_id, { want: r.want, pay: r.pay, payMonthCents: Number(r.pay_cents_month), payOnceCents: Number(r.pay_cents_once), test: r.test });
  }
  return out;
}

export type ClosestProject = { fullName: string; url: string; stars: number; does: string; missing: string | null; onSite: boolean };
export type Claim = { handle: string; username: string | null; provider: Provider; name: string | null; avatarUrl: string | null; note: string | null; repoUrl: string | null };
export type GapPage = {
  idea: {
    id: string; slug: string; title: string; pitch: string; missing: string; problem: string; build: string; strong: string;
    sourceUrl: string | null; createdAt: string; status: BuildStatus;
    poster: { kind: 'person'; handle: string; username: string | null; provider: Provider } | { kind: 'backer'; name: string } | { kind: 'platform' };
  };
  demand: Demand;
  merged: { slug: string; title: string; want: number; reason: string; id: string }[];
  products: { slug: string; name: string }[];
  closest: ClosestProject[];
  claims: Claim[];
  season: { id: number; name: string } | null;
  followers: number;
  mine: { hearted: boolean; signals: Map<SignalKind, { payCents: number | null; payPeriod: PayPeriod | null }>; following: boolean; claimed: boolean };
};

export async function getGapPage(
  db: SupabaseClient,
  slug: string,
  who: { userId: string | null; personId: string | null; visitor: string | undefined },
): Promise<GapPage | { redirect: string } | null> {
  const { data: row, error } = await db
    .from('ideas')
    .select('id, slug, title, pitch, missing, existing_repos, status, created_at, build_status, merged_into, author_id, backer_id, problem, build, strong, source_url, people:author_id(handle, username, provider), backers:backer_id(name)')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return null;
  let mergedSlug: string | null = null;
  if (row.merged_into) {
    const t = await db.from('ideas').select('slug').eq('id', row.merged_into).maybeSingle();
    mergedSlug = t.data?.slug ?? null;
  }
  const route = whereTo({ slug: row.slug, merged_into_slug: mergedSlug, status: row.status });
  if ('redirect' in route) return route;
  if ('missing' in route) return null;

  const [mergedRows, productRows, claimRows, briefRow, followerCount] = await Promise.all([
    db.from('ideas').select('id, slug, title').eq('merged_into', row.id),
    db.from('gap_products').select('products(slug, name)').eq('idea_id', row.id),
    db.from('gap_claims').select('person_id, note, repo_url, created_at, people:person_id(handle, username, provider, name, avatar_url)').eq('idea_id', row.id).order('created_at'),
    db.from('season_briefs').select('seasons(id, name)').eq('idea_id', row.id).limit(1).maybeSingle(),
    db.from('follows').select('follower_id', { count: 'exact', head: true }).eq('subject_kind', 'gap').eq('subject_id', row.id),
  ]);
  const mergedList = (mergedRows.data ?? []) as { id: string; slug: string; title: string }[];
  const [demand, mergedDemand, reasons] = await Promise.all([
    demandFor(db, [row.id]),
    demandFor(db, mergedList.map((m) => m.id)),
    mergedList.length
      ? db.from('merge_log').select('from_idea, reason').in('from_idea', mergedList.map((m) => m.id)).is('undone_at', null)
      : Promise.resolve({ data: [] as { from_idea: string; reason: string }[] }),
  ]);
  const reasonOf = new Map(((reasons as any).data ?? []).map((r: any) => [r.from_idea, r.reason]));

  // The closest projects: what the GitHub search found when the gap was posted, with our own
  // record of each repo where the sync has one.
  const repos = (Array.isArray(row.existing_repos) ? row.existing_repos : []) as { fullName: string; url: string; stars: number }[];
  const known = repos.length
    ? ((await db.from('projects').select('full_name, description, stars, listed').in('full_name', repos.map((r) => r.fullName))).data ?? [])
    : [];
  const knownBy = new Map(known.map((k: any) => [k.full_name.toLowerCase(), k]));
  const closest: ClosestProject[] = repos.slice(0, 6).map((r, i) => {
    const k: any = knownBy.get(r.fullName.toLowerCase());
    return {
      fullName: r.fullName,
      url: r.url,
      stars: k?.stars ?? r.stars,
      does: k?.description ?? '',
      missing: i === 0 && row.missing ? row.missing : null,
      onSite: Boolean(k?.listed),
    };
  });

  const [hearted, signals, following] = await Promise.all([
    who.userId || who.visitor
      ? db.from('idea_hearts').select('idea_id').eq('idea_id', row.id).or([who.visitor ? `visitor.eq.${who.visitor}` : '', who.userId ? `user_id.eq.${who.userId}` : ''].filter(Boolean).join(',')).limit(1)
      : Promise.resolve({ data: [] }),
    signalsOf(db, { userId: who.userId ?? undefined, visitor: who.visitor }, 'gap', [row.id]),
    who.personId
      ? db.from('follows').select('follower_id').eq('follower_id', who.personId).eq('subject_kind', 'gap').eq('subject_id', row.id).limit(1)
      : Promise.resolve({ data: [] }),
  ]);

  const people: any = row.people;
  const backer: any = row.backers;
  const claims: Claim[] = ((claimRows.data ?? []) as any[]).filter((c) => c.people).map((c) => ({
    handle: c.people.handle, username: c.people.username ?? null, provider: providerOf(c.people), name: c.people.name ?? null, avatarUrl: c.people.avatar_url ?? null, note: c.note, repoUrl: c.repo_url,
  }));
  const season: any = (briefRow.data as any)?.seasons ?? null;

  return {
    idea: {
      id: row.id, slug: row.slug, title: row.title, pitch: row.pitch ?? '', missing: row.missing ?? '',
      problem: row.problem ?? '', build: row.build ?? '', strong: row.strong ?? '',
      sourceUrl: typeof row.source_url === 'string' && row.source_url.startsWith('https://') ? row.source_url : null,
      createdAt: row.created_at, status: (row.build_status ?? 'wanted') as BuildStatus,
      poster: people?.handle ? { kind: 'person', handle: people.handle, username: people.username ?? null, provider: providerOf(people) } : backer ? { kind: 'backer', name: backer.name?.trim() || 'A backer' } : { kind: 'platform' },
    },
    demand: demand.get(row.id) ?? noDemand,
    merged: mergedList.map((m) => ({ ...m, want: mergedDemand.get(m.id)?.want ?? 0, reason: String(reasonOf.get(m.id) ?? '') })),
    products: ((productRows.data ?? []) as any[]).map((p) => p.products).filter(Boolean),
    closest,
    claims,
    season: season ? { id: season.id, name: season.name } : null,
    followers: followerCount.count ?? 0,
    mine: {
      hearted: ((hearted as any).data ?? []).length > 0,
      signals: signals.get(row.id) ?? new Map(),
      following: ((following as any).data ?? []).length > 0,
      claimed: Boolean(who.personId && ((claimRows.data ?? []) as any[]).some((c) => c.person_id === who.personId)),
    },
  };
}
