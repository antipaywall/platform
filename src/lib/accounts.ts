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
