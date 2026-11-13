import type { SupabaseClient } from '@supabase/supabase-js';
import { searchRepos, type RepoHit } from './github';
import type { MessageCode } from './respond';

import type { Writeup } from './forms';

type Parsed = { title: string; pitch: string; missing: string; slug: string };

/**
 * Stores a new idea and returns where to send the poster and what to tell them.
 * `authorId` is the person posting, or null when the platform posts it itself.
 * A person must say what is missing when similar projects already exist; the platform's
 * starter ideas may leave that blank.
 */
export async function storeIdea(
  db: SupabaseClient,
  parsed: Parsed,
  authorId: string | null,
  writeup?: Writeup,
  opts: { productIds?: string[] } = {},
): Promise<{ slug: string | null; code: MessageCode }> {
  // The same name already listed: send them to it rather than making a duplicate.
  const same = await db.from('ideas').select('slug, status').ilike('title', parsed.title.replace(/[%_\\]/g, '\\$&')).limit(1).maybeSingle();
  if (same.data?.status === 'listed') return { slug: same.data.slug, code: 'idea_exists' };

  // The list of existing projects is looked up here, never taken from the form.
  let repos: RepoHit[] = [];
  try {
    repos = await searchRepos(writeup?.search || parsed.title);
  } catch {
    // GitHub search is down or rate-limited: the idea can still be posted, without the list.
  }
  if (authorId && repos.length && parsed.missing.length < 10) return { slug: null, code: 'need_missing' };

  // Slugs are unique. If this one is taken by a different or hidden idea, add a short suffix.
  let slug = parsed.slug;
  const taken = await db.from('ideas').select('id').eq('slug', slug).maybeSingle();
  if (taken.data) slug = `${slug}-${crypto.randomUUID().slice(0, 6)}`;

  const made = await db.from('ideas').insert({
    slug, title: parsed.title, pitch: parsed.pitch, missing: parsed.missing,
    existing_repos: repos.map((r) => ({ fullName: r.fullName, url: r.url, stars: r.stars })),
    author_id: authorId,
    ...(writeup ? { problem: writeup.problem, build: writeup.build, strong: writeup.strong, source_url: writeup.sourceUrl } : {}),
  });
  if (made.error) return { slug: null, code: 'save_failed' };
  // The paid products the poster said it replaces. A failure here never loses the gap itself.
  if (opts.productIds?.length) {
    const { data: row } = await db.from('ideas').select('id').eq('slug', slug).maybeSingle();
    if (row) await db.from('gap_products').insert(opts.productIds.slice(0, 5).map((product_id) => ({ idea_id: row.id, product_id }))).then(() => undefined, () => undefined);
  }
  return { slug, code: 'idea_posted' };
}
