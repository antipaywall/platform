// Public profiles: who can be seen, where their page is, and keeping their saved repositories fresh.

import type { SupabaseClient } from '@supabase/supabase-js';
import { providerOf, type Provider } from './accounts';
import { DataUnavailableError, type Person } from './db';
import { fetchActivity, savedActivity, type Activity } from './activity';
import { fetchRepos, isStale, savedRepos, type Repo } from './repos';
import { adminClient } from './supabase';

/** A builder's page is always public. Anyone else's only when they switched it on. */
export const isPublic = (p: Pick<Person, 'is_builder' | 'profile_public'>) => p.is_builder || p.profile_public === true;

/** The profile's address on this site. GitLab accounts live under /builders/gitlab/ so names never collide. */
export const profilePath = (provider: Provider, handle: string) =>
  provider === 'gitlab' ? `/builders/gitlab/${encodeURIComponent(handle)}` : `/builders/${encodeURIComponent(handle)}`;

/** Reads /builders/<handle> or /builders/gitlab/<handle>. Anything else is not a profile address. */
export function parseProfilePath(slug: string | undefined): { provider: Provider; handle: string } | null {
  const parts = (slug ?? '').split('/').filter(Boolean);
  const [provider, raw] = parts.length === 2 && parts[0] === 'gitlab' ? ['gitlab' as const, parts[1]] : parts.length === 1 ? ['github' as const, parts[0]] : [null, null];
  if (!provider || !raw) return null;
  let handle: string;
  try {
    handle = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(handle) ? { provider, handle } : null;
}

function db(): SupabaseClient {
  const client = adminClient();
  if (!client) throw new DataUnavailableError('not configured');
  return client;
}

/** The person behind a profile address, whether or not their profile is public. Matching ignores case. */
export async function findProfile(provider: Provider, handle: string): Promise<Person | null> {
  const pattern = handle.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data, error } = await db().from('people').select('*').eq('provider', provider).ilike('handle', pattern).limit(1).maybeSingle();
  if (error) throw new DataUnavailableError(error.message);
  return (data as Person) ?? null;
}

/** Their listed ideas, newest first. */
export async function ideasBy(personId: string): Promise<{ slug: string; title: string }[]> {
  const { data, error } = await db().from('ideas').select('slug, title').eq('author_id', personId).eq('status', 'listed').order('created_at', { ascending: false }).limit(20);
  if (error) throw new DataUnavailableError(error.message);
  return data ?? [];
}

/** Their live pledge, if any: for their own account page only. */
export async function pledgeOf(personId: string): Promise<{ amount_cents: number; status: string; anonymous: boolean } | null> {
  const { data, error } = await db().from('pledges').select('amount_cents, status, anonymous').eq('person_id', personId).in('status', ['held', 'listed']).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new DataUnavailableError(error.message);
  return data ?? null;
}

/** Whether their sign-in address is on the email list. */
export async function onList(personId: string): Promise<boolean | null> {
  const { data, error } = await db().from('subscribers').select('unsubscribed_at').eq('person_id', personId);
  if (error) return null;
  return (data ?? []).some((r) => !r.unsubscribed_at);
}

/**
 * Fetches their public repositories and saves them. Gives up after `timeoutMs` and returns
 * the saved copy, so a slow provider never holds a page. Never throws.
 */
export async function refreshRepos(person: Person, opts: { timeoutMs?: number; force?: boolean; now?: Date } = {}): Promise<Repo[]> {
  const saved = savedRepos(person.repos);
  const now = opts.now ?? new Date();
  if (!opts.force && !isStale(person.repos_fetched_at, now)) return saved;
  const provider = providerOf(person);
  const accountId = Number(provider === 'gitlab' ? person.gitlab_id : person.github_id);
  const work = (async () => {
    try {
      const repos = await fetchRepos({ provider, handle: person.handle, accountId }, { githubToken: import.meta.env.GITHUB_TOKEN });
      const client = adminClient();
      if (client) await client.from('people').update({ repos, repos_fetched_at: now.toISOString() }).eq('id', person.id);
      return repos;
    } catch {
      return saved;
    }
  })();
  const timeout = new Promise<Repo[]>((done) => setTimeout(() => done(saved), opts.timeoutMs ?? 2500));
  return Promise.race([work, timeout]);
}

/**
 * Fetches their activity calendar and saves it. GitHub needs a token: the person's own at sign-in,
 * or the site's `GITHUB_TOKEN` afterwards. Gives up after `timeoutMs` and returns the saved copy.
 * Never throws.
 */
export async function refreshActivity(person: Person, opts: { token?: string; timeoutMs?: number; force?: boolean; now?: Date } = {}): Promise<Activity> {
  const saved = savedActivity(person.contributions);
  const now = opts.now ?? new Date();
  if (!opts.force && !isStale(person.contributions_fetched_at, now)) return saved;
  const provider = providerOf(person);
  const token = opts.token ?? import.meta.env.GITHUB_TOKEN;
  if (provider === 'github' && !token) return saved;
  const work = (async () => {
    try {
      const fresh = await fetchActivity({ provider, handle: person.handle }, { token, now });
      const client = adminClient();
      if (client) await client.from('people').update({ contributions: fresh, contributions_fetched_at: now.toISOString() }).eq('id', person.id);
      return fresh;
    } catch {
      return saved;
    }
  })();
  const timeout = new Promise<Activity>((done) => setTimeout(() => done(saved), opts.timeoutMs ?? 2500));
  return Promise.race([work, timeout]);
}
