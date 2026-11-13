// Suggesting improvements to ideas: who may accept them, where they live on GitHub, and how the
// site follows changes made in the ideas repo.

import { IDEAS_REPO } from './githubApp';
import { ideaPath, type IdeaFile, type IdeaStatus } from './ideaFile';

/**
 * The person who posted the idea decides (matched by their account, so a username changing hands
 * never hands over their ideas). For an idea added straight on GitHub, its starter's login decides.
 * Maintainers decide for ideas Antipaywall posted, and can always step in.
 */
export function canDecide(idea: { authorId?: string | null; startedBy: string | null }, viewer: { personId: string; login: string }, maintainers: readonly string[]): boolean {
  const me = viewer.login.toLowerCase();
  if (maintainers.some((m) => m.toLowerCase() === me)) return true;
  if (idea.authorId) return idea.authorId === viewer.personId;
  return Boolean(idea.startedBy && idea.startedBy.toLowerCase() === me);
}

type PrLike = { head?: { ref?: string; repo?: { full_name?: string } | null }; base?: { repo?: { full_name?: string } }; user?: { type?: string }; number?: number };
const REPO = `${IDEAS_REPO.owner}/${IDEAS_REPO.name}`;
const BRANCH = /^suggest\/([a-z0-9-]+)\/([a-z0-9-]+)-[a-z0-9]+$/;

/**
 * A pull request that may be accepted as a suggestion for this idea: opened by the App, from its own
 * branch for this idea in the ideas repo itself, changing that one idea's file and nothing else.
 */
export function validSuggestionPr(pr: PrLike, files: string[], slug: string): boolean {
  if ((pr.head?.repo?.full_name ?? '').toLowerCase() !== REPO || (pr.base?.repo?.full_name ?? REPO).toLowerCase() !== REPO) return false;
  if (pr.user?.type !== 'Bot') return false;
  if (BRANCH.exec(pr.head?.ref ?? '')?.[1] !== slug) return false;
  return files.length === 1 && files[0] === ideaPath(slug);
}

/** The suggestion a pull request event is about, if the App opened it on its own branch. */
export function suggestionFromEvent(e: { repository?: { full_name?: string }; pull_request?: PrLike }): { slug: string; login: string; number: number } | null {
  const pr = e.pull_request;
  if (!pr || (e.repository?.full_name ?? '').toLowerCase() !== REPO) return null;
  if ((pr.head?.repo?.full_name ?? '').toLowerCase() !== REPO || pr.user?.type !== 'Bot') return null;
  const m = BRANCH.exec(pr.head?.ref ?? '');
  return m && typeof pr.number === 'number' ? { slug: m[1], login: m[2], number: pr.number } : null;
}

/** Each suggestion gets its own branch, so two people suggesting at once never collide. */
export const suggestionBranch = (slug: string, login: string, now: Date) => `suggest/${slug}/${login.toLowerCase()}-${now.getTime().toString(36)}`;

/** The idea files a push to the ideas repo's main branch added, changed or removed. */
export function changedIdeaPaths(push: { ref?: string; repository?: { full_name?: string }; commits?: { added?: string[]; modified?: string[]; removed?: string[] }[] }): { changed: string[]; removed: string[] } {
  const none = { changed: [], removed: [] };
  if (push.ref !== 'refs/heads/main') return none;
  if ((push.repository?.full_name ?? '').toLowerCase() !== `${IDEAS_REPO.owner}/${IDEAS_REPO.name}`) return none;
  const isIdea = (p: string) => /^ideas\/[a-z0-9-]+\.md$/.test(p);
  const changed = new Set<string>();
  const removed = new Set<string>();
  for (const c of push.commits ?? []) {
    for (const p of [...(c.added ?? []), ...(c.modified ?? [])]) if (isIdea(p)) { changed.add(p); removed.delete(p); }
    for (const p of c.removed ?? []) if (isIdea(p)) { removed.add(p); changed.delete(p); }
  }
  return { changed: [...changed], removed: [...removed] };
}

/** An idea as the site stores it, written out as its file. */
export function ideaFromRow(
  row: { slug: string; title: string; pitch: string; problem: string; build: string; strong: string; missing: string; build_status: string; merged_into_slug: string | null; created_at: string },
  startedBy: string | null,
  replaces: string[],
): IdeaFile {
  return {
    slug: row.slug,
    title: row.title,
    ...(row.pitch ? { pitch: row.pitch } : {}),
    status: (['wanted', 'building', 'exists', 'adopt'].includes(row.build_status) ? row.build_status : 'wanted') as IdeaStatus,
    startedBy,
    replaces,
    like: [],
    mergedInto: row.merged_into_slug,
    created: row.created_at.slice(0, 10),
    sections: {
      ...(row.problem ? { problem: row.problem } : {}),
      ...(row.build ? { build: row.build } : {}),
      ...(row.missing ? { missing: row.missing } : {}),
      ...(row.strong ? { strong: row.strong } : {}),
    },
  };
}

/** Where the public copy of an idea can be read without any token. */
export const rawIdeaUrl = (slug: string) => `https://raw.githubusercontent.com/${IDEAS_REPO.owner}/${IDEAS_REPO.name}/main/${ideaPath(slug)}`;
export const repoIdeaUrl = (slug: string) => `https://github.com/${IDEAS_REPO.owner}/${IDEAS_REPO.name}/blob/main/${ideaPath(slug)}`;
