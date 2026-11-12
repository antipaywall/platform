import type { APIRoute } from 'astro';
import { isAdmin } from '../../../lib/db';
import { back } from '../../../lib/respond';
import { adminClient } from '../../../lib/supabase';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Which table each kind lives in, the column that identifies a row, and where to land afterwards.
const KINDS = {
  panel: ['panel_applications', 'person_id', '#panel'],
  organize: ['organize_offers', 'person_id', '#organize'],
  sponsor: ['sponsor_inquiries', 'id', '#inquiries'],
} as const;

// Marks something sent to the organizer as handled, or not. Organizer only.
export const POST: APIRoute = async ({ request, locals }) => {
  if (!isAdmin(locals.person)) return new Response(null, { status: 404 });
  const db = adminClient();
  if (!db) return back('/admin', 'save_failed');
  const form = await request.formData();
  const kind = String(form.get('kind') ?? '');
  const id = String(form.get('id') ?? '');
  if (!Object.hasOwn(KINDS, kind) || !UUID.test(id)) return back('/admin', 'save_failed');
  const [table, column, anchor] = KINDS[kind as keyof typeof KINDS];
  const { error } = await db.from(table).update({ handled: form.get('handled') === '1' }).eq(column, id);
  return back(`/admin${anchor}`, error ? 'save_failed' : 'done');
};
