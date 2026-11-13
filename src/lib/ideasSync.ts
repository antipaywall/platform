// Keeping the site's copy of ideas in step with the antipaywall/ideas repo, which is the source of
// truth. The site writes through the GitHub App, and reads changes back from the App's events.

import type { SupabaseClient } from '@supabase/supabase-js';
import { appConfigured, authorFor, commitIdeaFile, readIdeaFile } from './githubApp';
import { ideaPath, parseIdeaFile, renderIdeaFile, type IdeaFile } from './ideaFile';
import { ideaFromRow } from './suggestions';

/** Writes a repo file's contents into the site's row for that idea (creating the row if needed). */
export async function applyIdeaFile(db: SupabaseClient, file: IdeaFile, sha: string | null): Promise<void> {
  const author = file.startedBy
    ? ((await db.from('people').select('id').ilike('username', file.startedBy.replace(/[%_\\]/g, '\\$&')).maybeSingle()).data?.id ?? null)
    : null;
  const mergedInto = file.mergedInto ? ((await db.from('ideas').select('id').eq('slug', file.mergedInto).maybeSingle()).data?.id ?? null) : null;
  const fields = {
    title: file.title.slice(0, 80),
    pitch: (file.pitch ?? '').slice(0, 280),
    problem: (file.sections.problem ?? '').slice(0, 1200),
    build: (file.sections.build ?? '').slice(0, 1200),
    missing: (file.sections.missing ?? '').slice(0, 600),
    strong: (file.sections.strong ?? '').slice(0, 1200),
    build_status: file.status === 'adopt' ? 'exists' : file.status,
    merged_into: mergedInto,
    repo_path: ideaPath(file.slug),
    repo_sha: sha,
    synced_from_repo_at: new Date().toISOString(),
    started_by_login: file.startedBy,
  };
  const { data: row } = await db.from('ideas').select('id').eq('slug', file.slug).maybeSingle();
  let id = row?.id as string | undefined;
  if (id) {
    await db.from('ideas').update(fields).eq('id', id);
  } else {
    const made = await db.from('ideas').insert({ slug: file.slug, ...fields, author_id: author, status: 'listed' }).select('id').single();
    id = made.data?.id;
  }
  if (!id) return;
  if (file.replaces.length) {
    const { data: products } = await db.from('products').select('id').in('slug', file.replaces);
    await db.from('gap_products').delete().eq('idea_id', id);
    if (products?.length) await db.from('gap_products').insert(products.map((p) => ({ idea_id: id, product_id: p.id })));
  }
}

/** Marks an idea whose file was removed from the repo as no longer listed. */
export async function removeIdea(db: SupabaseClient, slug: string): Promise<void> {
  await db.from('ideas').update({ status: 'hidden' }).eq('slug', slug);
}

/**
 * Writes a newly posted idea to the repo through the App, credited to the builder who posted it.
 * Without the App configured it does nothing: the idea lives in the database until it is.
 */
export async function pushNewIdea(db: SupabaseClient, slug: string, poster: { login: string; githubId?: number | null } | null): Promise<boolean> {
  if (!appConfigured()) return false;
  const { data: row } = await db.from('ideas').select('id, slug, title, pitch, problem, build, strong, missing, build_status, created_at, gap_products(products(slug))').eq('slug', slug).maybeSingle();
  if (!row) return false;
  const file = ideaFromRow({ ...(row as any), merged_into_slug: null }, poster?.login ?? null, ((row as any).gap_products ?? []).map((g: any) => g.products?.slug).filter(Boolean));
  const path = ideaPath(slug);
  const existing = await readIdeaFile(path);
  const author = poster ? authorFor(poster.login, poster.githubId) : { name: 'Antipaywall', email: 'hello@antipaywall.org' };
  const written = await commitIdeaFile(path, renderIdeaFile(file), `Add: ${file.title}`, author, existing ? { sha: existing.sha } : {});
  await db.from('ideas').update({ repo_path: path, repo_sha: written.sha, synced_from_repo_at: new Date().toISOString(), started_by_login: poster?.login ?? null }).eq('id', (row as any).id);
  return true;
}

/** Reads one idea's file from the public repo (no token needed). Null when it isn't there. */
export async function publicIdeaFile(slug: string, f: typeof fetch = fetch): Promise<IdeaFile | null> {
  try {
    const res = await f(`https://raw.githubusercontent.com/antipaywall/ideas/main/${ideaPath(slug)}`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return null;
    return parseIdeaFile(await res.text(), ideaPath(slug));
  } catch {
    return null;
  }
}
