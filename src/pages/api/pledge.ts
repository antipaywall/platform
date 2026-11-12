import type { APIRoute } from 'astro';
import { recordEvent } from '../../lib/events';
import { parsePledge } from '../../lib/forms';
import { back } from '../../lib/respond';
import { adminClient } from '../../lib/supabase';

// A pledge to the prize pool. One open pledge per person: a new one replaces the old.
export const POST: APIRoute = async (context) => {
  const { request, locals } = context;
  const person = locals.person;
  const db = adminClient();
  if (!person || !db) return back('/fund', 'need_signin');
  const form = await request.formData();
  const parsed = parsePledge({
    amount: form.get('amount'), displayName: form.get('display_name'), kind: form.get('kind'),
    companyUrl: form.get('company_url'), xHandle: form.get('x_handle'), email: form.get('email'), anonymous: form.get('anonymous'),
    githubHandle: person.handle,
  });
  const here = form.get('kind') === 'company' ? '/fund?as=company' : '/fund';
  if (!parsed.ok) return back(here, parsed.error);

  const { data: id, error } = await db.rpc('replace_pledge', {
    p_person: person.id, p_name: parsed.displayName, p_cents: parsed.amountCents, p_status: parsed.status,
    p_kind: parsed.kind, p_company_url: parsed.companyUrl, p_x_handle: parsed.xHandle,
    p_email: parsed.email, p_anonymous: parsed.anonymous,
  });
  if (error) return back('/fund', 'save_failed');
  await recordEvent(db, context, { kind: 'pledged', personId: person.id, subject: typeof id === 'string' ? id : null });
  return back('/fund', parsed.status === 'held' ? 'pledge_held' : 'pledge_listed');
};
