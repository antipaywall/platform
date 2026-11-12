import type { APIRoute } from 'astro';
import { countryCode } from '../../lib/analytics';
import { deliver, organizerNotice } from '../../lib/email';
import { recordEvent } from '../../lib/events';
import { parseOrganize } from '../../lib/intake';
import { MAX_NOTES_PER_HOUR, takeSlot } from '../../lib/ratelimit';
import { back } from '../../lib/respond';
import { adminClient } from '../../lib/supabase';

const HERE = '/join/organize';

// An offer to help run it. Signed-in people only; sending it again replaces the earlier one.
export const POST: APIRoute = async (context) => {
  const { request, locals } = context;
  const person = locals.person;
  const db = adminClient();
  if (!person || !db) return back(HERE, 'need_signin');
  const form = await request.formData();
  const parsed = parseOrganize({ note: form.get('note') });
  if (!parsed.ok) return back(HERE, parsed.error);
  // Each save emails the organizer, so one person can only do it a few times an hour.
  const slot = await takeSlot(db, 'organize', person.id, MAX_NOTES_PER_HOUR);
  if (slot === 'limited') return back(HERE, 'too_many');
  if (slot === 'error') return back(HERE, 'save_failed');
  const before = await db.from('organize_offers').select('person_id').eq('person_id', person.id).maybeSingle();
  const { error } = await db.from('organize_offers').upsert({
    person_id: person.id, note: parsed.note,
    country: countryCode(request.headers.get('x-vercel-ip-country')),
    handled: false, updated_at: new Date().toISOString(),
  });
  if (error) return back(HERE, 'save_failed');
  // Sending it again replaces the earlier one, so only the first is recorded as something done.
  if (!before.data) await recordEvent(db, context, { kind: 'organize_offered', personId: person.id });
  await deliver(db, organizerNotice('An offer to help organize', [['GitHub', `@${person.handle}`], ['Can help with', parsed.note]]));
  return back(HERE, 'organize_saved');
};
