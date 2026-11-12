// Who just signed in, according to GitHub and nothing else.
//
// A sign-in session carries two kinds of profile data. `user_metadata` can be changed by the
// signed-in user, so it is never trusted here. The GitHub identity record is written by the
// sign-in provider from what GitHub returned, and that is the only place the id is read from.

type IdentityLike = { provider?: string; id?: string; identity_data?: Record<string, unknown> | null };
type UserLike = { app_metadata?: Record<string, unknown> | null; identities?: IdentityLike[] | null };

/** The GitHub account behind this session, or null if the session did not come from a GitHub sign-in. */
export function githubIdentity(user: UserLike): { githubId: number; email: string | null } | null {
  if (user.app_metadata?.provider !== 'github') return null;
  const identity = (user.identities ?? []).find((i) => i.provider === 'github');
  if (!identity) return null;
  const raw = identity.identity_data?.provider_id ?? identity.identity_data?.sub ?? identity.id;
  const githubId = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d{1,15}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(githubId) || githubId <= 0) return null;
  const email = identity.identity_data?.email;
  return { githubId, email: typeof email === 'string' ? email : null };
}
