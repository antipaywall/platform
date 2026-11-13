// Posts, replies, bricks and follows: reading them for pages. Writing happens in the API routes.

import type { SupabaseClient } from '@supabase/supabase-js';
import { providerOf, type Provider } from './accounts';
import { entriesFor } from './entries';
import { badgesFor, topBadge, type Badge, type GrantedBadge } from './badges';
import { DataUnavailableError } from './db';
import { adminClient } from './supabase';

export type PostKind = 'update' | 'team' | 'ask' | 'shipped';
export const POST_KINDS: readonly { key: PostKind; label: string; plural: string }[] = [
  { key: 'update', label: 'Update', plural: 'Updates' },
  { key: 'team', label: 'Looking for a team', plural: 'Looking for a team' },
  { key: 'ask', label: 'Question', plural: 'Questions' },
  { key: 'shipped', label: 'Shipped', plural: 'Shipped' },
];
export const POST_MAX = 500;
export const POSTS_PER_DAY = 10;
export const REPLIES_PER_DAY = 50;
/** Links from accounts younger than this are shown as text, not links. */
export const NEW_ACCOUNT_MS = 7 * 24 * 60 * 60 * 1000;

export type Author = { id: string; handle: string; username?: string | null; provider: Provider; name: string | null; avatar_url: string | null; badge: Badge | null; newAccount: boolean };
export type ReplyView = { id: string; body: string; created_at: string; author: Author };
export type PostView = {
  id: string; kind: PostKind; body: string; link_url: string | null; created_at: string;
  author: Author; bricks: number; bricked: boolean; replies: ReplyView[];
};

function db(): SupabaseClient {
  const client = adminClient();
  if (!client) throw new DataUnavailableError('not configured');
  return client;
}

/** Badges the organizer gave, for a set of people. */
export async function grantedBadges(ids: string[]): Promise<Map<string, GrantedBadge[]>> {
  const out = new Map<string, GrantedBadge[]>();
  if (!ids.length) return out;
  const { data, error } = await db().from('badges').select('person_id, kind, season, place, note').in('person_id', ids);
  if (error) throw new DataUnavailableError(error.message);
  for (const r of data ?? []) out.set(r.person_id, [...(out.get(r.person_id) ?? []), r as GrantedBadge]);
  return out;
}

async function authors(ids: string[], now: Date): Promise<Map<string, Author>> {
  const unique = [...new Set(ids)];
  const out = new Map<string, Author>();
  if (!unique.length) return out;
  const [{ data, error }, granted, entries] = await Promise.all([
    db().from('people').select('id, handle, username, provider, name, avatar_url, verified, is_builder, created_at').in('id', unique),
    grantedBadges(unique),
    entriesFor(db(), unique),
  ]);
  if (error) throw new DataUnavailableError(error.message);
  for (const p of data ?? []) {
    out.set(p.id, {
      id: p.id, handle: p.handle, username: p.username ?? null, provider: providerOf(p), name: p.name ?? null, avatar_url: p.avatar_url ?? null,
      badge: topBadge(badgesFor(p, granted.get(p.id) ?? [], { entry: entries.has(p.id) })),
      newAccount: now.getTime() - Date.parse(p.created_at) < NEW_ACCOUNT_MS,
    });
  }
  return out;
}

const POST_COLS = 'id, person_id, kind, body, link_url, created_at';

/** Turns post rows into what a page shows: authors, badges, brick counts, replies. Keeps the given order. */
export async function hydrate(rows: any[], viewerId: string | null, now = new Date()): Promise<PostView[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [bricks, mine, replies] = await Promise.all([
    db().from('post_bricks').select('post_id').in('post_id', ids),
    viewerId ? db().from('post_bricks').select('post_id').in('post_id', ids).eq('person_id', viewerId) : Promise.resolve({ data: [], error: null }),
    db().from('posts').select('id, parent_id, person_id, body, created_at').in('parent_id', ids).is('hidden_at', null).order('created_at').limit(500),
  ]);
  for (const r of [bricks, mine, replies]) if (r.error) throw new DataUnavailableError(r.error.message);
  const people = await authors([...rows.map((r) => r.person_id), ...(replies.data ?? []).map((r: any) => r.person_id)], now);
  const count = new Map<string, number>();
  for (const b of bricks.data ?? []) count.set(b.post_id, (count.get(b.post_id) ?? 0) + 1);
  const minePosts = new Set((mine.data ?? []).map((b: any) => b.post_id));
  return rows
    .filter((r) => people.has(r.person_id))
    .map((r) => ({
      id: r.id, kind: r.kind, body: r.body, link_url: r.link_url, created_at: r.created_at,
      author: people.get(r.person_id)!, bricks: count.get(r.id) ?? 0, bricked: minePosts.has(r.id),
      replies: (replies.data ?? [])
        .filter((x: any) => x.parent_id === r.id && people.has(x.person_id))
        .map((x: any) => ({ id: x.id, body: x.body, created_at: x.created_at, author: people.get(x.person_id)! })),
    }));
}

/** A person's own posts, newest first. */
export async function postsBy(personId: string, viewerId: string | null, limit = 20): Promise<PostView[]> {
  const { data, error } = await db().from('posts').select(POST_COLS).eq('person_id', personId).is('parent_id', null).is('hidden_at', null).order('created_at', { ascending: false }).limit(limit);
  if (error) throw new DataUnavailableError(error.message);
  return hydrate(data ?? [], viewerId);
}

/** Newest posts, from everyone or only from people the viewer follows. */
export async function feedLatest(opts: { viewerId: string | null; following: boolean; kind: PostKind | null; limit?: number }): Promise<PostView[]> {
  let q = db().from('posts').select(POST_COLS).is('parent_id', null).is('hidden_at', null).order('created_at', { ascending: false }).limit(opts.limit ?? 30);
  if (opts.kind) q = q.eq('kind', opts.kind);
  if (opts.following) {
    if (!opts.viewerId) return [];
    const f = await db().from('follows').select('subject_id').eq('follower_id', opts.viewerId).eq('subject_kind', 'person').limit(2000);
    if (f.error) throw new DataUnavailableError(f.error.message);
    const ids = (f.data ?? []).map((r) => r.subject_id);
    if (!ids.length) return [];
    q = q.in('person_id', ids);
  }
  const { data, error } = await q;
  if (error) throw new DataUnavailableError(error.message);
  return hydrate(data ?? [], opts.viewerId);
}

/** The Everyone feed, ranked in the database (see feed_top in migration 0017). */
export async function feedTop(opts: { viewerId: string | null; kind: PostKind | null; boostKinds: boolean; limit?: number }): Promise<PostView[]> {
  const ranked = await db().rpc('feed_top', { p_limit: opts.limit ?? 30, p_offset: 0, p_kind: opts.kind, p_boost_kinds: opts.boostKinds });
  if (ranked.error) throw new DataUnavailableError(ranked.error.message);
  const ids = ((ranked.data ?? []) as any[]).map((r) => (typeof r === 'string' ? r : r.feed_top ?? r.id));
  if (!ids.length) return [];
  const { data, error } = await db().from('posts').select(POST_COLS).in('id', ids);
  if (error) throw new DataUnavailableError(error.message);
  const byId = new Map((data ?? []).map((r) => [r.id, r]));
  return hydrate(ids.map((id) => byId.get(id)).filter(Boolean), opts.viewerId);
}

export async function followCounts(personId: string): Promise<{ followers: number; following: number }> {
  const [a, b] = await Promise.all([
    db().from('follows').select('follower_id', { count: 'exact', head: true }).eq('subject_kind', 'person').eq('subject_id', personId),
    db().from('follows').select('subject_id', { count: 'exact', head: true }).eq('subject_kind', 'person').eq('follower_id', personId),
  ]);
  if (a.error || b.error) throw new DataUnavailableError((a.error ?? b.error)!.message);
  return { followers: a.count ?? 0, following: b.count ?? 0 };
}

export async function isFollowing(followerId: string, followeeId: string): Promise<boolean> {
  const { data, error } = await db().from('follows').select('subject_id').eq('follower_id', followerId).eq('subject_kind', 'person').eq('subject_id', followeeId).maybeSingle();
  if (error) throw new DataUnavailableError(error.message);
  return Boolean(data);
}

/** Builders the viewer doesn't follow yet, newest first. */
export async function suggestions(viewerId: string | null, limit = 3): Promise<Author[]> {
  const exclude = new Set<string>(viewerId ? [viewerId] : []);
  if (viewerId) {
    const f = await db().from('follows').select('subject_id').eq('follower_id', viewerId).eq('subject_kind', 'person').limit(2000);
    for (const r of f.data ?? []) exclude.add(r.subject_id);
  }
  const { data, error } = await db().from('people').select('id').eq('is_builder', true).order('joined_at', { ascending: false }).limit(limit + exclude.size);
  if (error) throw new DataUnavailableError(error.message);
  const ids = (data ?? []).map((r) => r.id).filter((id) => !exclude.has(id)).slice(0, limit);
  const map = await authors(ids, new Date());
  return ids.map((id) => map.get(id)).filter((a): a is Author => Boolean(a));
}

/** How many posts (or replies) this person wrote in the last 24 hours. */
export async function postedToday(personId: string, replies: boolean): Promise<number> {
  let q = db().from('posts').select('id', { count: 'exact', head: true }).eq('person_id', personId).gt('created_at', new Date(Date.now() - 86_400_000).toISOString());
  q = replies ? q.not('parent_id', 'is', null) : q.is('parent_id', null);
  const { count, error } = await q;
  if (error) throw new DataUnavailableError(error.message);
  return count ?? 0;
}

/** "3m", "5h", "2d", or a date for anything older than a week. */
export function ago(iso: string, now = new Date()): string {
  const s = Math.max(0, (now.getTime() - Date.parse(iso)) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** The badge shown next to each builder's name on a tile. Everyone on a tile is a builder. */
export async function tileBadges(ids: string[]): Promise<Map<string, Badge | null>> {
  const [granted, entries] = await Promise.all([grantedBadges(ids), entriesFor(db(), ids)]);
  return new Map(ids.map((id) => [id, topBadge(badgesFor({ verified: true, is_builder: true }, granted.get(id) ?? [], { entry: entries.has(id) }))]));
}
