// The two places someone can sign in from. Kept free of network and database code.

export type Provider = 'github' | 'gitlab';

export const PROVIDERS: readonly Provider[] = ['github', 'gitlab'];

const NAMES: Record<Provider, string> = { github: 'GitHub', gitlab: 'GitLab' };
const HOSTS: Record<Provider, string> = { github: 'https://github.com', gitlab: 'https://gitlab.com' };

/** The provider named in a request, or null for anything else. */
export function parseProvider(raw: unknown): Provider | null {
  return raw === 'github' || raw === 'gitlab' ? raw : null;
}

/** Reads a stored provider. Rows from before GitLab existed are GitHub accounts. */
export const providerOf = (p: { provider?: string | null } | null | undefined): Provider => (p?.provider === 'gitlab' ? 'gitlab' : 'github');

/** "GitHub" or "GitLab". */
export const providerName = (p: Provider) => NAMES[p];

/** The public profile page for a username on that provider. */
export const profileUrl = (p: Provider, handle: string) => `${HOSTS[p]}/${encodeURIComponent(handle)}`;

/**
 * The GitHub login this account has proved it owns, or null. A GitHub account's handle is what GitHub
 * said at its last sign-in; a GitLab account counts only through a linked GitHub account that GitHub
 * confirmed. The username here is chosen on this site and proves nothing about GitHub, so it is never used.
 */
export function verifiedGithubLogin(p: { provider?: string | null; handle?: string | null; github_login?: string | null }): string | null {
  // A handle marked stale (another account has since proved it owns that name) has a "~" and matches nothing.
  if (providerOf(p) === 'github') return p.handle && !p.handle.includes('~') ? p.handle : null;
  return p.github_login ?? null;
}

/** "GitLab: @name (https://gitlab.com/name)": the account someone signed in with, for an organizer's email. */
export function accountLine(p: { provider?: string | null; handle: string }): [string, string] {
  const provider = providerOf(p);
  return [providerName(provider), `@${p.handle} (${profileUrl(provider, p.handle)})`];
}
