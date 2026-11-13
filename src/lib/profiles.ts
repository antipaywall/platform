// Public profiles: who can be seen, where their page is, and keeping their saved repositories fresh.

import type { SupabaseClient } from '@supabase/supabase-js';
import { providerOf } from './accounts';
import { DataUnavailableError, type Person } from './db';
import { fetchActivity, savedActivity, type Activity } from './activity';
import { fetchDetails, fetchRepos, isStale, savedRepos, type Repo } from './repos';
import { adminClient } from './supabase';

/** A builder's page is always public. Anyone else's only when they switched it on. */
export const isPublic = (p: Pick<Person, 'is_builder' | 'profile_public'>) => p.is_builder || p.profile_public === true;

/** The profile's address on this site. GitLab accounts live under /builders/gitlab/ so names never collide. */
/** A builder's address: /builders/<username>, one namespace for GitHub and GitLab sign-ins alike. */
// Someone who signed up through the live site before the release has no username yet (only the
// release's sign-in sets one). A GitHub account's username is its login, so the handle stands in.
const nameOf = (p: { username?: string | null; handle: string; provider?: string | null }) => p.username || (p.provider === 'gitlab' ? null : p.handle);
export const profilePath = (p: { username?: string | null; handle: string; provider?: string | null }) => {
  const name = nameOf(p);
  return name ? `/builders/${encodeURIComponent(name)}` : '/builders';
};

/**
 * Reads /builders/<username>, and the old /builders/gitlab/<handle> addresses (kept so they can
 * redirect). Anything else is not a profile address.
 */
export function parseProfilePath(slug: string | undefined): { kind: 'username'; name: string } | { kind: 'gitlab'; handle: string } | null {
  const parts = (slug ?? '').split('/').filter(Boolean);
  const gitlab = parts.length === 2 && parts[0] === 'gitlab';
  const raw = gitlab ? parts[1] : parts.length === 1 ? parts[0] : null;
  if (!raw) return null;
  let name: string;
  try {
    name = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(name)) return null;
  return gitlab ? { kind: 'gitlab', handle: name } : { kind: 'username', name };
}

function db(): SupabaseClient {
  const client = adminClient();
  if (!client) throw new DataUnavailableError('not configured');
  return client;
}

const like = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * The person behind a profile address, whether or not their profile is public. Matching ignores case.
 * An old username or an old GitLab address comes back as a redirect to the current one.
 */
export async function findProfile(where: NonNullable<ReturnType<typeof parseProfilePath>>): Promise<Person | { redirect: string } | null> {
  if (where.kind === 'gitlab') {
    const { data } = await db().from('people').select('username, handle').eq('provider', 'gitlab').ilike('handle', like(where.handle)).limit(1).maybeSingle();
    return data ? { redirect: profilePath(data) } : null;
  }
  const { data, error } = await db().from('people').select('*').ilike('username', like(where.name)).limit(1).maybeSingle();
  if (error) throw new DataUnavailableError(error.message);
  if (data) return data as Person;
  // No username saved yet (see nameOf): a GitHub account is found by its login.
  const unnamed = await db().from('people').select('*').is('username', null).neq('provider', 'gitlab').ilike('handle', like(where.name)).limit(1).maybeSingle();
  if (unnamed.error) throw new DataUnavailableError(unnamed.error.message);
  if (unnamed.data) return unnamed.data as Person;
  const old = await db().from('username_redirects').select('people:person_id(username, handle)').ilike('old_username', like(where.name)).maybeSingle();
  const to: any = old.data?.people;
  return to ? { redirect: profilePath(to) } : null;
}

export type ProfileIdea = { slug: string; title: string; pitch: string; hearts: number; similar: number; created_at: string };

/** Their listed ideas, newest first, with heart counts and how many similar projects were found. */
export async function ideasBy(personId: string): Promise<ProfileIdea[]> {
  const own = await db().from('ideas').select('id').eq('author_id', personId).eq('status', 'listed').limit(50);
  if (own.error) throw new DataUnavailableError(own.error.message);
  const ids = (own.data ?? []).map((r) => r.id);
  if (!ids.length) return [];
  const { data, error } = await db().from('idea_totals').select('slug, title, pitch, hearts, existing_repos, created_at').in('id', ids).order('created_at', { ascending: false });
  if (error) throw new DataUnavailableError(error.message);
  return (data ?? []).map((i: any) => ({
    slug: i.slug, title: i.title, pitch: i.pitch ?? '', hearts: Number(i.hearts) || 0,
    similar: Array.isArray(i.existing_repos) ? i.existing_repos.length : 0, created_at: i.created_at,
  }));
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
      const who = { provider, handle: person.handle, accountId };
      const opts = { githubToken: import.meta.env.GITHUB_TOKEN };
      // The name, bio and location refresh with the repos, so a profile stays current without a new sign-in.
      const [repos, details] = await Promise.all([fetchRepos(who, opts), fetchDetails(who, opts)]);
      const client = adminClient();
      if (client) {
        await client.from('people').update({
          repos, repos_fetched_at: now.toISOString(),
          ...(details ? { name: details.name, bio: details.bio, location: details.location, ...(details.repoCount !== null ? { repo_count: details.repoCount } : {}) } : {}),
        }).eq('id', person.id);
      }
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
