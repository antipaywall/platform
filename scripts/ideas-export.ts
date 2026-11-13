// Writes every listed idea as a file for the antipaywall/ideas repo.
//
//   pnpm ideas:export                 writes them to ./ideas-export/ to read first (nothing leaves this machine)
//   pnpm ideas:export --commit        commits each to the repo through the Antipaywall GitHub App,
//                                     credited to the person who posted it
//
// Needs SUPABASE_URL and SUPABASE_SECRET_KEY; --commit also needs the GitHub App's variables.

import { mkdirSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { appConfigured, authorFor, commitIdeaFile, readIdeaFile } from '../src/lib/githubApp';
import { ideaPath, renderIdeaFile } from '../src/lib/ideaFile';
import { ideaFromRow } from '../src/lib/suggestions';

const COMMIT = process.argv.includes('--commit');

async function main() {
  const db = createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SECRET_KEY ?? '', { auth: { persistSession: false } });
  const { data, error } = await db
    .from('ideas')
    .select('id, slug, title, pitch, problem, build, strong, missing, build_status, created_at, merged_into, people:author_id(username, handle, github_id), gap_products(products(slug))')
    .eq('status', 'listed')
    .order('created_at');
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as any[];
  const slugOf = new Map(rows.map((r) => [r.id, r.slug]));
  if (COMMIT && !appConfigured()) throw new Error('The GitHub App variables are not set');
  if (!COMMIT) mkdirSync('ideas-export/ideas', { recursive: true });
  for (const r of rows) {
    const login = r.people ? r.people.username ?? r.people.handle : null;
    const file = ideaFromRow({ ...r, merged_into_slug: r.merged_into ? slugOf.get(r.merged_into) ?? null : null }, login, (r.gap_products ?? []).map((g: any) => g.products?.slug).filter(Boolean));
    const text = renderIdeaFile(file);
    const path = ideaPath(r.slug);
    if (!COMMIT) {
      writeFileSync(`ideas-export/${path}`, text);
      console.log(`wrote ideas-export/${path}`);
      continue;
    }
    const existing = await readIdeaFile(path);
    const author = login ? authorFor(login, r.people?.github_id) : { name: 'Antipaywall', email: 'hello@antipaywall.org' };
    const written = await commitIdeaFile(path, text, `Add: ${file.title}`, author, existing ? { sha: existing.sha } : {});
    await db.from('ideas').update({ repo_path: path, repo_sha: written.sha, synced_from_repo_at: new Date().toISOString(), started_by_login: login }).eq('id', r.id);
    console.log(`committed ${path}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
