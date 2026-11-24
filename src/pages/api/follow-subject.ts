import type { APIRoute } from 'astro';
import { parseFollow } from '../../lib/gaps';
import { back } from '../../lib/respond';
import { adminClient } from '../../lib/supabase';

// Follow a gap, a project, a paid product or a topic. The follows table only takes GitHub or
// GitLab accounts, so email backers are asked to sign in that way.
export const POST: APIRoute = async ({ request, locals }) => {
  const form = await request.formData();
  const nextRaw = String(form.get('next') ?? '/');
  const next = nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/';
  const wantsJson = (request.headers.get('accept') ?? '').includes('application/json');
  const reply = (ok: boolean, code: Parameters<typeof back>[1]) => (wantsJson ? Response.json({ ok, code }, { status: ok ? 200 : 400 }) : back(next, code));
  if (!locals.person) return reply(false, 'signin_for_follow');
  const parsed = parseFollow(form);
  if (!parsed.ok) return reply(false, 'save_failed');
  const db = adminClient();
  if (!db) return reply(false, 'save_failed');
  const key = { follower_id: locals.person.id, subject_kind: parsed.kind, subject_id: parsed.id };
  const { error } = parsed.on ? await db.from('follows').upsert(key, { ignoreDuplicates: true }) : await db.from('follows').delete().match(key);
  return reply(!error, error ? 'save_failed' : 'done');
};
