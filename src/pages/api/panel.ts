import type { APIRoute } from 'astro';
import { countryCode } from '../../lib/analytics';
import { deliver, organizerNotice } from '../../lib/email';
import { parsePanel } from '../../lib/intake';
import { MAX_NOTES_PER_HOUR, takeSlot } from '../../lib/ratelimit';
import { back } from '../../lib/respond';
import { adminClient } from '../../lib/supabase';

const HERE = '/join/panel';

// An application to sit on the review panel. Signed-in people only; sending it again replaces the earlier one.
export const POST: APIRoute = async ({ request, locals }) => {
  const person = locals.person;
  const db = adminClient();
  if (!person || !db) return back(HERE, 'need_signin');
  const form = await request.formData();
  const parsed = parsePanel({ why: form.get('why'), ties: form.get('ties') });
  if (!parsed.ok) return back(HERE, parsed.error);
  // Each save emails the organizer, so one person can only do it a few times an hour.
  const slot = await takeSlot(db, 'panel', person.id, MAX_NOTES_PER_HOUR);
  if (slot === 'limited') return back(HERE, 'too_many');
  if (slot === 'error') return back(HERE, 'save_failed');
  const { error } = await db.from('panel_applications').upsert({
    person_id: person.id, why: parsed.why, ties: parsed.ties,
    country: countryCode(request.headers.get('x-vercel-ip-country')),
    handled: false, updated_at: new Date().toISOString(),
  });
  if (error) return back(HERE, 'save_failed');
  await deliver(db, organizerNotice('A review panel application', [['GitHub', `@${person.handle}`], ['Why', parsed.why], ['Ties', parsed.ties]]));
  return back(HERE, 'panel_saved');
};
