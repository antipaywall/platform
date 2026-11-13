import type { AccountFacts } from './eligibility';
import { text } from './github';

export class GitlabUnavailableError extends Error {}

const DAY = 86_400_000;

/**
 * Reads the facts the eligibility rules need, as the signed-in GitLab user, from gitlab.com.
 * The account comes from the user's own token. Contributions come from the public activity
 * calendar GitLab shows on the profile page, counted over the last 365 days; a private profile
 * shows none. Throws GitlabUnavailableError when GitLab cannot tell us who this is.
 */
export async function fetchGitlabFacts(token: string, now: Date, fetchImpl: typeof fetch = fetch): Promise<AccountFacts> {
  let res: Response;
  try {
    res = await fetchImpl('https://gitlab.com/api/v4/user', { headers: { authorization: `Bearer ${token}`, 'user-agent': 'antipaywall' } });
  } catch {
    throw new GitlabUnavailableError('network');
  }
  if (!res.ok) throw new GitlabUnavailableError(`status ${res.status}`);
  const u = (await res.json().catch(() => null)) as any;
  const id = Number(u?.id);
  if (!Number.isSafeInteger(id) || id <= 0 || typeof u?.username !== 'string' || !u.username || typeof u?.created_at !== 'string') {
    throw new GitlabUnavailableError('no user');
  }
  return {
    provider: 'gitlab',
    accountId: id,
    handle: u.username,
    avatarUrl: typeof u.avatar_url === 'string' ? u.avatar_url : '',
    accountCreatedAt: u.created_at,
    contributions12mo: await countContributions(u.username, now, fetchImpl),
    name: text(u.name, 120),
    bio: text(u.bio, 400),
    location: text(u.location, 120),
    repoCount: null,
  };
}

/** Sums the public activity calendar for the last 365 days. Anything unreadable counts as none. */
async function countContributions(username: string, now: Date, fetchImpl: typeof fetch): Promise<number> {
  const res = await fetchImpl(`https://gitlab.com/users/${encodeURIComponent(username)}/calendar.json`, {
    headers: { accept: 'application/json', 'user-agent': 'antipaywall' },
  }).catch(() => null);
  if (!res || !res.ok) return 0;
  const days = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!days || typeof days !== 'object' || Array.isArray(days)) return 0;
  const since = now.getTime() - 365 * DAY;
  let total = 0;
  for (const [day, n] of Object.entries(days)) {
    const t = Date.parse(`${day}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !(t >= since) || t > now.getTime()) continue;
    if (typeof n === 'number' && Number.isSafeInteger(n) && n > 0) total += n;
  }
  return total;
}
