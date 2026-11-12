// Who just signed in, according to GitHub or GitLab and nothing else.
//
// A sign-in session carries two kinds of profile data. `user_metadata` can be changed by the
// signed-in user, so it is never trusted here. Each identity record is written by the sign-in
// provider from what GitHub or GitLab returned, and that is the only place the id is read from.

import type { Provider } from './accounts';

type IdentityLike = { provider?: string; id?: string; identity_data?: Record<string, unknown> | null };
type UserLike = { app_metadata?: Record<string, unknown> | null; identities?: IdentityLike[] | null };

/**
 * The account behind this session on the provider the sign-in was started with, or null if the
 * session holds no identity record from that provider. `provider` comes from our own sign-in
 * link, so on its own it proves nothing: the caller must still check the account id against
 * what the provider says about the token.
 */
export function accountIdentity(user: UserLike, provider: Provider): { provider: Provider; accountId: number; email: string | null } | null {
  const providers = user.app_metadata?.providers;
  const listed = Array.isArray(providers) ? providers.includes(provider) : user.app_metadata?.provider === provider;
  if (!listed) return null;
  const identity = (user.identities ?? []).find((i) => i.provider === provider);
  if (!identity) return null;
  const raw = identity.identity_data?.provider_id ?? identity.identity_data?.sub ?? identity.id;
  const accountId = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d{1,15}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(accountId) || accountId <= 0) return null;
  const email = identity.identity_data?.email;
  return { provider, accountId, email: typeof email === 'string' ? email : null };
}
