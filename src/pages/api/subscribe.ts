import type { APIRoute } from 'astro';
import { countryCode } from '../../lib/analytics';
import { recordEvent } from '../../lib/events';
import { parseSubscribe } from '../../lib/intake';
import { addToList } from '../../lib/list';
import { MAX_SUBSCRIBES_PER_HOUR, takeSlot } from '../../lib/ratelimit';
import { senderKey } from '../../lib/requester';
import { back } from '../../lib/respond';
import { adminClient } from '../../lib/supabase';

const HERE = '/hackathon/join#follow';

// "Follow along": an email address joins the list. No account needed.
//
// The form must not be usable to find out who is on the list. So the hourly allowance is
// checked before the address is looked at, every attempt counts against it whether or not
// the address was new, and the answer is the same for new, already listed and unsubscribed.
// The address is never tied to a signed-in account: only the GitHub sign-in does that.
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const parsed = parseSubscribe({ email: form.get('email'), trap: form.get('website') });
  if (!parsed.ok) return back(HERE, parsed.error);
  // A filled-in trap field means a script. It gets the same answer, and nothing is saved.
  if (parsed.spam) return back(HERE, 'subscribed');

  const db = adminClient();
  const sender = senderKey(context);
  if (!db || !sender) return back(HERE, 'save_failed');
  const slot = await takeSlot(db, 'subscribe', sender, MAX_SUBSCRIBES_PER_HOUR);
  if (slot === 'limited') return back(HERE, 'too_many');
  if (slot === 'error') return back(HERE, 'save_failed');

  const { status, id } = await addToList(db, {
    email: parsed.email, source: 'form',
    country: countryCode(context.request.headers.get('x-vercel-ip-country')),
  });
  // Recorded only for an address that was new, and by the list entry's id, never the address.
  if (status === 'new') await recordEvent(db, context, { kind: 'list_joined', subject: id });
  return back(HERE, status === 'failed' ? 'save_failed' : 'subscribed');
};
