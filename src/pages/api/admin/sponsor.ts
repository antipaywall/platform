import type { APIRoute } from 'astro';
import { isAdmin } from '../../../lib/db';
import { parseSponsor } from '../../../lib/forms';
import { back } from '../../../lib/respond';
import { adminClient } from '../../../lib/supabase';

// Add a sponsor, edit one, or change whether it is shown. Organizer only.
export const POST: APIRoute = async ({ request, locals }) => {
  if (!isAdmin(locals.person)) return new Response(null, { status: 404 });
  const db = adminClient();
  if (!db) return back('/admin', 'save_failed');
  const form = await request.formData();
  const id = String(form.get('id') ?? '');
  const action = String(form.get('action') ?? 'save');
  const hasId = /^[0-9a-f-]{36}$/.test(id);

  if (action === 'list' || action === 'unlist') {
    if (!hasId) return back('/admin', 'save_failed');
    const { error } = await db.from('sponsors').update({ listed: action === 'list' }).eq('id', id);
    return back('/admin', error ? 'save_failed' : 'done');
  }

  const parsed = parseSponsor({
    name: form.get('name'), url: form.get('url'), logoUrl: form.get('logo_url'), amount: form.get('amount'),
    kind: form.get('kind'), status: form.get('status'), note: form.get('note'), listed: form.get('listed'),
  });
  if (!parsed.ok) return back('/admin', parsed.error);
  const s = parsed.sponsor;
  const row = {
    name: s.name, url: s.url, logo_url: s.logoUrl, amount_cents: s.amountCents,
    kind: s.kind, status: s.status, note: s.note, listed: s.listed,
  };
  const { error } = hasId ? await db.from('sponsors').update(row).eq('id', id) : await db.from('sponsors').insert(row);
  return back('/admin', error ? 'save_failed' : 'done');
};
