import type { APIRoute } from 'astro';
import { isAdmin } from '../../../lib/db';
import { back } from '../../../lib/respond';
import { adminClient } from '../../../lib/supabase';

const BACK = '/admin/community';
const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v);
const GRANTABLE = new Set(['founder', 'organizer', 'panel', 'sponsor', 'winner']);

// Moderation and badges. Organizer only.
//   hide / unhide: a post or reply. Hiding also closes its reports.
//   keep: closes a post's reports and leaves it up.
//   posting_off / posting_on: whether a person can post.
//   grant / revoke: a badge.
export const POST: APIRoute = async ({ request, locals }) => {
  if (!isAdmin(locals.person)) return new Response(null, { status: 404 });
  const db = adminClient();
  if (!db) return back(BACK, 'save_failed');
  const form = await request.formData();
  const action = String(form.get('action') ?? '');
  const id = form.get('id');
  let error: { message: string } | null = null;
  if (action === 'hide' || action === 'unhide' || action === 'keep') {
    if (!uuid(id)) return back(BACK, 'save_failed');
    if (action !== 'keep') ({ error } = await db.from('posts').update({ hidden_at: action === 'hide' ? new Date().toISOString() : null }).eq('id', id));
    if (!error && action !== 'unhide') ({ error } = await db.from('post_reports').update({ handled: true }).eq('post_id', id));
  } else if (action === 'posting_off' || action === 'posting_on') {
    if (!uuid(id)) return back(BACK, 'save_failed');
    ({ error } = await db.from('people').update({ can_post: action === 'posting_on' }).eq('id', id));
  } else if (action === 'grant') {
    const kind = String(form.get('kind') ?? '');
    const handle = String(form.get('handle') ?? '').trim().replace(/^@/, '');
    const provider = form.get('provider') === 'gitlab' ? 'gitlab' : 'github';
    if (!GRANTABLE.has(kind) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(handle)) return back(BACK, 'save_failed');
    const person = await db.from('people').select('id').eq('provider', provider).ilike('handle', handle.replace(/[\\%_]/g, (c) => `\\${c}`)).maybeSingle();
    if (!person.data) return back(BACK, 'no_such_person');
    const season = kind === 'winner' ? Number(form.get('season')) || 1 : null;
    const place = kind === 'winner' ? Number(form.get('place')) || null : null;
    const note = String(form.get('note') ?? '').trim().slice(0, 80) || null;
    ({ error } = await db.from('badges').insert({ person_id: person.data.id, kind, season, place, note }));
  } else if (action === 'revoke') {
    if (!uuid(id)) return back(BACK, 'save_failed');
    ({ error } = await db.from('badges').delete().eq('id', id));
  } else {
    return back(BACK, 'save_failed');
  }
  return back(BACK, error ? 'save_failed' : 'done');
};
