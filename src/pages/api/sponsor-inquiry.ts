import type { APIRoute } from 'astro';
import { countryCode } from '../../lib/analytics';
import { deliver, organizerNotice } from '../../lib/email';
import { parseSponsorInquiry } from '../../lib/intake';
import { MAX_INQUIRIES_PER_HOUR, takeSlot } from '../../lib/ratelimit';
import { senderKey } from '../../lib/requester';
import { back } from '../../lib/respond';
import { adminClient } from '../../lib/supabase';

const HERE = '/sponsor#inquiry';

// A company asking about sponsoring. No account needed. It is stored for the organizer and he is told by email.
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const parsed = parseSponsorInquiry({
    company: form.get('company'), contact: form.get('contact'), email: form.get('email'), amount: form.get('amount'),
    kind: form.get('kind'), message: form.get('message'), trap: form.get('website'),
  });
  if (!parsed.ok) return back(HERE, parsed.error);
  // A filled-in trap field means a script. It gets the same answer, and nothing is saved or sent.
  if (parsed.spam) return back(HERE, 'inquiry_saved');

  const db = adminClient();
  const sender = senderKey(context);
  if (!db || !sender) return back(HERE, 'save_failed');
  // The hourly allowance is checked first, and every attempt counts against it.
  const slot = await takeSlot(db, 'inquiry', sender, MAX_INQUIRIES_PER_HOUR);
  if (slot === 'limited') return back(HERE, 'too_many');
  if (slot === 'error') return back(HERE, 'save_failed');
  const { data, error } = await db.rpc('save_sponsor_inquiry', {
    p_company: parsed.company, p_contact: parsed.contact, p_email: parsed.email, p_amount: parsed.amountUsd,
    p_kind: parsed.kind, p_message: parsed.message,
    p_country: countryCode(context.request.headers.get('x-vercel-ip-country')),
    // Nothing that identifies the connection is stored with the inquiry.
    p_sender: '-', p_max_per_hour: 1_000_000,
  });
  if (error) return back(HERE, 'save_failed');
  if (data === false) return back(HERE, 'too_many');
  await deliver(db, organizerNotice('A sponsor inquiry', [
    ['Company', parsed.company], ['Contact', parsed.contact], ['Email', parsed.email],
    ['Rough amount', parsed.amountUsd === null ? '' : `$${parsed.amountUsd.toLocaleString('en-US')}`],
    ['For', parsed.kind], ['Message', parsed.message],
  ]));
  return back(HERE, 'inquiry_saved');
};
