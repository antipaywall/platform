// Usernames: one namespace, /builders/<username>. A GitHub sign-in's username is its GitHub login,
// and a GitHub owner can always claim their own name. A GitLab sign-in keeps its GitLab handle
// unless that name is taken here or exists on GitHub; then the builder connects GitHub (proving the
// name is theirs) or picks another.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Provider } from './accounts';
import { appConfigured, installationToken } from './githubApp';

const RULE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

/** GitHub's own rules: letters, digits and single dashes, not at either end, 1 to 39 characters. */
export const validUsername = (s: string) => RULE.test(s);

/** Whether GitHub has a public account with this name. "unknown" when GitHub can't be asked. */
export async function githubHasUser(name: string, f: typeof fetch = fetch): Promise<'yes' | 'no' | 'unknown'> {
  try {
    const token = (typeof process !== 'undefined' ? process.env.GITHUB_TOKEN : undefined) || (appConfigured() ? await installationToken().catch(() => undefined) : undefined);
    const headers: Record<string, string> = { accept: 'application/vnd.github+json', 'user-agent': 'antipaywall' };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await f(`https://api.github.com/users/${encodeURIComponent(name)}`, { headers, signal: AbortSignal.timeout(3000) });
    if (res.status === 200) return 'yes';
    if (res.status === 404) return 'no';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export type Holder = { id: string; provider: Provider } | null;
export type Decision = { username: string; bump: string | null } | { choose: true; wanted: string; reason: 'taken' | 'on_github' | 'github_unreachable' | 'invalid' };

/**
 * The username a person gets at sign-in. `holder(name)` says who holds a name here now.
 * `bump` is a GitLab builder who must give the name up to its GitHub owner.
 */
export async function decideUsername(
  who: { id: string; provider: Provider; handle: string; githubLogin?: string | null; current?: string | null },
  holder: (name: string) => Promise<Holder>,
  onGithub: (name: string) => Promise<'yes' | 'no' | 'unknown'>,
): Promise<Decision> {
  // A GitLab builder keeps a name they chose themselves (it was checked against GitHub when they
  // picked it). A name that is just their GitLab handle is checked again below, every time.
  if (who.provider === 'gitlab' && !who.githubLogin && who.current && who.current.toLowerCase() !== who.handle.toLowerCase() && validUsername(who.current)) {
    const h = await holder(who.current);
    if (!h || h.id === who.id) return { username: who.current, bump: null };
  }
  // A GitHub account, or a GitLab account that proved it owns a GitHub login, gets that login.
  const owned = who.provider === 'github' ? who.handle : who.githubLogin ?? null;
  if (owned) {
    if (!validUsername(owned)) return { choose: true, wanted: owned, reason: 'invalid' };
    const h = await holder(owned);
    if (!h || h.id === who.id) return { username: owned, bump: null };
    // Only a GitLab builder can hold a GitHub owner's name; a GitHub one would be the same account.
    return h.provider === 'gitlab' ? { username: owned, bump: h.id } : { choose: true, wanted: owned, reason: 'taken' };
  }
  const wanted = who.handle;
  if (!validUsername(wanted)) return { choose: true, wanted, reason: 'invalid' };
  const h = await holder(wanted);
  if (h && h.id !== who.id) return { choose: true, wanted, reason: 'taken' };
  const gh = await onGithub(wanted);
  if (gh === 'yes') return { choose: true, wanted, reason: 'on_github' };
  if (gh === 'unknown') return { choose: true, wanted, reason: 'github_unreachable' };
  return { username: wanted, bump: null };
}

/** Who holds a username here now (case-insensitive). */
export const holderIn = (db: SupabaseClient) => async (name: string): Promise<Holder> => {
  const { data } = await db.from('people').select('id, provider').ilike('username', name.replace(/[%_\\]/g, '\\$&')).maybeSingle();
  return data ? { id: data.id, provider: data.provider === 'gitlab' ? 'gitlab' : 'github' } : null;
};

/**
 * A free name for a builder who had to give theirs up: name-2, name-3 … for a few tries, then a
 * unique suffix. A GitHub lookup that can't be answered doesn't block it.
 */
export async function pickFreeName(base: string, holder: (n: string) => Promise<Holder>, onGithub: (n: string) => Promise<'yes' | 'no' | 'unknown'>, tries = 5): Promise<string> {
  const stem = base.slice(0, 30).replace(/-+$/, '') || 'builder';
  for (let i = 2; i < 2 + tries; i++) {
    const candidate = `${stem}-${i}`;
    if (await holder(candidate)) continue;
    if ((await onGithub(candidate)) === 'yes') continue;
    return candidate;
  }
  return `${stem}-${Date.now().toString(36)}`;
}

export const freeName = (db: SupabaseClient, base: string) => pickFreeName(base, holderIn(db), (n) => githubHasUser(n));

/** Sets a person's username, leaving a redirect from the old one. */
export async function setUsername(db: SupabaseClient, personId: string, username: string): Promise<boolean> {
  const { data: before } = await db.from('people').select('username').eq('id', personId).maybeSingle();
  const { error } = await db.from('people').update({ username }).eq('id', personId);
  if (error) return false;
  const old = before?.username;
  if (old && old.toLowerCase() !== username.toLowerCase()) {
    await db.from('username_redirects').upsert({ old_username: old, person_id: personId }, { onConflict: 'old_username' });
  }
  return true;
}

/** Applies a decision at sign-in. Returns the username, or the reason to ask the builder to choose. */
export async function assignUsername(db: SupabaseClient, who: { id: string; provider: Provider; handle: string; githubLogin?: string | null; current?: string | null }): Promise<Decision> {
  const decision = await decideUsername(who, holderIn(db), (n) => githubHasUser(n));
  // A GitLab handle that turns out to belong to someone on GitHub is given up: they choose again.
  if ('choose' in decision && decision.reason === 'on_github' && who.current && who.current.toLowerCase() === decision.wanted.toLowerCase()) {
    await db.from('people').update({ username: null }).eq('id', who.id);
  }
  if ('username' in decision) {
    if (decision.bump) {
      const { data: bumped } = await db.from('people').select('username').eq('id', decision.bump).maybeSingle();
      await setUsername(db, decision.bump, await freeName(db, bumped?.username ?? decision.username));
    }
    await setUsername(db, who.id, decision.username);
  }
  return decision;
}

/** Checks a name a builder picked for themselves. */
export async function checkChosen(
  personId: string,
  name: string,
  holder: (name: string) => Promise<Holder>,
  onGithub: (name: string) => Promise<'yes' | 'no' | 'unknown'>,
): Promise<{ ok: true; username: string } | { ok: false; reason: 'invalid' | 'taken' | 'on_github' | 'github_unreachable' }> {
  const n = name.trim();
  if (!validUsername(n)) return { ok: false, reason: 'invalid' };
  const h = await holder(n);
  if (h && h.id !== personId) return { ok: false, reason: 'taken' };
  const gh = await onGithub(n);
  if (gh === 'yes') return { ok: false, reason: 'on_github' };
  if (gh === 'unknown') return { ok: false, reason: 'github_unreachable' };
  return { ok: true, username: n };
}

/**
 * What to do with a request from someone signed in who has no username yet (a GitLab builder whose
 * name collided). They never act under a borrowed name: pages send them to choose, writes are refused.
 */
export function usernameGate(path: string, method: string): 'allow' | 'choose' | 'refuse' {
  if (path.startsWith('/auth/') || path === '/api/account/username') return 'allow';
  if (/^\/(_astro|_image)\//.test(path) || /\.[a-z0-9]{2,5}$/i.test(path)) return 'allow';
  return ['GET', 'HEAD'].includes(method.toUpperCase()) ? 'choose' : 'refuse';
}
