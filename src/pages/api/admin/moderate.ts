import type { APIRoute } from 'astro';
import { isAdmin } from '../../../lib/db';
import { back } from '../../../lib/respond';
import { adminClient } from '../../../lib/supabase';

// Hide an idea or a pledge, or list a pledge that was held for a check. Organizer only.
export const POST: APIRoute = async ({ request, locals }) => {
  if (!isAdmin(locals.person)) return new Response(null, { status: 404 });
  const db = adminClient();
  if (!db) return back('/admin', 'save_failed');
  const form = await request.formData();
  const id = String(form.get('id') ?? '');
  const action = String(form.get('action') ?? '');
  if (!/^[0-9a-f-]{36}$/.test(id)) return back('/admin', 'save_failed');
  const change =
    action === 'hide_idea' ? db.from('ideas').update({ status: 'hidden' }).eq('id', id)
    : action === 'hide_pledge' ? db.from('pledges').update({ status: 'hidden' }).eq('id', id)
    : action === 'list_pledge' ? db.from('pledges').update({ status: 'listed' }).eq('id', id).eq('status', 'held')
    : null;
  if (!change) return back('/admin', 'save_failed');
  const { error } = await change;
  return back('/admin', error ? 'save_failed' : 'done');
};
