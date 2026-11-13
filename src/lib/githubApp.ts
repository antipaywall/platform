// The Antipaywall GitHub App: it writes ideas to the public antipaywall/ideas repo on builders'
// behalf, opens their suggested improvements as pull requests, and merges or closes them when the
// idea's starter decides. Everything it does is visible on GitHub.
//
// Configured with GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_INSTALLATION_ID and
// GITHUB_WEBHOOK_SECRET. Without them the site still works: ideas are saved to the database only.

import { createHmac, createSign, timingSafeEqual } from 'node:crypto';

export const IDEAS_REPO = { owner: 'antipaywall', name: 'ideas' } as const;
const env = (k: string) => (typeof process !== 'undefined' ? process.env[k] : undefined) ?? ((import.meta as { env?: Record<string, string | undefined> }).env?.[k]);

export const appConfigured = () => Boolean(env('GITHUB_APP_ID') && env('GITHUB_APP_PRIVATE_KEY') && env('GITHUB_APP_INSTALLATION_ID'));

/** The App's own short-lived token (RS256), used only to get an installation token. */
export function appJwt(appId: string, pem: string, now: Date): string {
  const iat = Math.floor(now.getTime() / 1000) - 30;
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = enc({ alg: 'RS256', typ: 'JWT' });
  const body = enc({ iat, exp: iat + 9 * 60, iss: appId });
  const sign = createSign('RSA-SHA256');
  sign.update(`${head}.${body}`);
  return `${head}.${body}.${sign.sign(pem.replace(/\\n/g, '\n')).toString('base64url')}`;
}

let cached: { token: string; expires: number } | null = null;

/** A token for the App's installation on the ideas repo, reused until five minutes before it expires. */
export async function installationToken(f: typeof fetch = fetch): Promise<string> {
  if (cached && cached.expires - Date.now() > 5 * 60_000) return cached.token;
  const jwt = appJwt(env('GITHUB_APP_ID')!, env('GITHUB_APP_PRIVATE_KEY')!, new Date());
  const res = await f(`https://api.github.com/app/installations/${env('GITHUB_APP_INSTALLATION_ID')}/access_tokens`, {
    method: 'POST',
    headers: { authorization: `Bearer ${jwt}`, accept: 'application/vnd.github+json', 'user-agent': 'antipaywall' },
  });
  if (!res.ok) throw new Error(`GitHub App token: ${res.status}`);
  const body = (await res.json()) as { token: string; expires_at: string };
  cached = { token: body.token, expires: Date.parse(body.expires_at) };
  return body.token;
}

/** Whether a webhook really came from GitHub, signed with our secret. */
export function verifyWebhook(body: string, signature: string | null, secret: string): boolean {
  if (!secret || !signature || !signature.startsWith('sha256=')) return false;
  const want = Buffer.from('sha256=' + createHmac('sha256', secret).update(body).digest('hex'));
  const got = Buffer.from(signature);
  return want.length === got.length && timingSafeEqual(want, got);
}

async function gh(path: string, init: RequestInit = {}, f: typeof fetch = fetch): Promise<any> {
  const token = await installationToken(f);
  const res = await f(`https://api.github.com/repos/${IDEAS_REPO.owner}/${IDEAS_REPO.name}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'antipaywall', 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`GitHub ${init.method ?? 'GET'} ${path}: ${res.status}`);
  return res.status === 204 ? null : res.json();
}

/** A person as a commit author: GitHub credits commits to their no-reply address. */
export const authorFor = (login: string, githubId?: number | null) => ({
  name: login,
  email: githubId ? `${githubId}+${login}@users.noreply.github.com` : `${login}@users.noreply.github.com`,
});

export async function readIdeaFile(path: string, ref = 'main'): Promise<{ text: string; sha: string } | null> {
  try {
    const r = await gh(`/contents/${path}?ref=${encodeURIComponent(ref)}`);
    return { text: Buffer.from(r.content, 'base64').toString('utf8'), sha: r.sha };
  } catch {
    return null;
  }
}

/** Writes a file on a branch (main by default), authored by the builder, committed by the App. */
export async function commitIdeaFile(path: string, text: string, message: string, author: { name: string; email: string }, opts: { sha?: string; branch?: string } = {}) {
  const r = await gh(`/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content: Buffer.from(text).toString('base64'), author, branch: opts.branch ?? 'main', ...(opts.sha ? { sha: opts.sha } : {}) }),
  });
  return { sha: r.content.sha as string, commit: r.commit.sha as string };
}

/** Opens a suggested improvement as a pull request from its own branch. */
export async function openSuggestion(path: string, text: string, opts: { branch: string; title: string; author: { name: string; email: string }; by: string; sha: string }) {
  const main = await gh('/git/ref/heads/main');
  await gh('/git/refs', { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${opts.branch}`, sha: main.object.sha }) });
  await commitIdeaFile(path, text, opts.title, opts.author, { sha: opts.sha, branch: opts.branch });
  const pr = await gh('/pulls', {
    method: 'POST',
    body: JSON.stringify({ title: opts.title, head: opts.branch, base: 'main', body: `Suggested by @${opts.by} on Antipaywall.\n\nThe idea's starter decides whether to accept it.` }),
  });
  return { number: pr.number as number, url: pr.html_url as string };
}

export const mergeSuggestion = (n: number) => gh(`/pulls/${n}/merge`, { method: 'PUT', body: JSON.stringify({ merge_method: 'squash' }) });

export async function closeSuggestion(n: number, note: string) {
  await gh(`/issues/${n}/comments`, { method: 'POST', body: JSON.stringify({ body: note }) });
  await gh(`/pulls/${n}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed' }) });
}

/** Who changed a file, newest first: the idea's history. */
export async function fileHistory(path: string): Promise<{ login: string; message: string; date: string; url: string }[]> {
  const list = (await gh(`/commits?path=${encodeURIComponent(path)}&per_page=30`)) as any[];
  return list.map((c) => ({ login: c.author?.login ?? c.commit?.author?.name ?? 'someone', message: String(c.commit?.message ?? '').split('\n')[0], date: c.commit?.author?.date ?? '', url: c.html_url }));
}

/** The diff of a suggestion, for the starter to read before deciding. */
export async function suggestionFiles(n: number): Promise<{ patch: string }[]> {
  const files = (await gh(`/pulls/${n}/files`)) as any[];
  return files.map((x) => ({ patch: String(x.patch ?? '') }));
}
