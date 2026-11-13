import type { APIRoute } from 'astro';
import { readIdeaFile, verifyWebhook } from '../../../lib/githubApp';
import { parseIdeaFile } from '../../../lib/ideaFile';
import { applyIdeaFile, removeIdea } from '../../../lib/ideasSync';
import { changedIdeaPaths } from '../../../lib/suggestions';
import { adminClient } from '../../../lib/supabase';

// Events from the Antipaywall GitHub App: pushes to the ideas repo's main branch update the site's
// copy of those ideas, and pull request events update the list of suggestions. Nothing is read
// until GitHub's signature checks out.
export const POST: APIRoute = async ({ request }) => {
  const body = await request.text();
  const secret = String(process.env.GITHUB_WEBHOOK_SECRET ?? import.meta.env.GITHUB_WEBHOOK_SECRET ?? '');
  if (!verifyWebhook(body, request.headers.get('x-hub-signature-256'), secret)) return new Response('Bad signature', { status: 401 });
  const db = adminClient();
  if (!db) return new Response('Unavailable', { status: 503 });
  const event = request.headers.get('x-github-event');
  const payload = JSON.parse(body);

  if (event === 'push') {
    const { changed, removed } = changedIdeaPaths(payload);
    for (const path of changed) {
      const file = await readIdeaFile(path);
      if (!file) continue;
      try {
        await applyIdeaFile(db, parseIdeaFile(file.text, path), file.sha);
      } catch {
        // A file someone broke by hand is left as it was on the site until it's fixed.
      }
    }
    for (const path of removed) await removeIdea(db, path.replace(/^ideas\//, '').replace(/\.md$/, ''));
    return new Response('ok');
  }

  if (event === 'pull_request' && (payload.repository?.full_name ?? '').toLowerCase() === 'antipaywall/ideas') {
    const pr = payload.pull_request;
    // Branches are suggest/<idea>/<login>-<time>: the App opens the PR, so the branch names the person.
    const m = /^suggest\/([a-z0-9-]+)\/([a-z0-9-]+)-[a-z0-9]+$/.exec(pr?.head?.ref ?? '');
    const slug = m?.[1];
    if (!slug) return new Response('ignored');
    const { data: idea } = await db.from('ideas').select('id').eq('slug', slug).maybeSingle();
    if (!idea) return new Response('ignored');
    const login = m![2];
    const person = (await db.from('people').select('id').ilike('username', login).maybeSingle()).data?.id ?? null;
    const state = pr.merged ? 'merged' : pr.state === 'open' ? 'open' : 'closed';
    await db.from('idea_suggestions').upsert(
      { idea_id: idea.id, pr_number: pr.number, author_login: login, person_id: person, title: String(pr.title ?? '').slice(0, 200), state, mergeable: pr.mergeable ?? null, updated_at: new Date().toISOString() },
      { onConflict: 'idea_id,pr_number', ignoreDuplicates: false },
    );
    return new Response('ok');
  }
  return new Response('ignored');
};
