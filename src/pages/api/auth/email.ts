import { createHmac } from 'node:crypto';
import type { APIRoute } from 'astro';
import { deliver, signInEmail } from '../../../lib/email';
import { requestEmailLink } from '../../../lib/emailSignIn';
import { takeSlot } from '../../../lib/ratelimit';
import { senderKey, VISITOR_KEY } from '../../../lib/requester';
import { back, safeNext } from '../../../lib/respond';
import { adminClient } from '../../../lib/supabase';

const PER_CONNECTION_PER_HOUR = 5;
const PER_ADDRESS_PER_HOUR = 3;

// Sends a sign-in link to an email address. The link is made here with Supabase's admin API and
// sent from Antipaywall's own address. Nobody is added to the email list.
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const next = safeNext(String(form.get('next') ?? ''), '/');
  const page = `/auth/email?next=${encodeURIComponent(next)}`;
  const db = adminClient();
  if (!db) return back(page, 'signin_unavailable');
  const sender = senderKey(context);
  const code = await requestEmailLink(
    { email: form.get('email'), next, origin: context.url.origin },
    {
      allowed: async (email) => {
        // The address is limited by a keyed hash of it, so no address is stored in the limits table.
        const addressKey = createHmac('sha256', VISITOR_KEY || 'antipaywall').update(`email-link\n${email}`).digest('hex').slice(0, 24);
        const [a, b] = await Promise.all([
          sender ? takeSlot(db, 'email_link', sender, PER_CONNECTION_PER_HOUR) : Promise.resolve('ok' as const),
          takeSlot(db, 'email_link_addr', addressKey, PER_ADDRESS_PER_HOUR),
        ]);
        return a !== 'limited' && b !== 'limited';
      },
      generate: async (email) => {
        let made = await db.auth.admin.generateLink({ type: 'magiclink', email });
        if (made.error) {
          // A first-time address has no account yet: make one, unconfirmed until the link is opened.
          await db.auth.admin.createUser({ email, email_confirm: false });
          made = await db.auth.admin.generateLink({ type: 'magiclink', email });
        }
        const token = made.data?.properties?.hashed_token;
        return token ? { hashedToken: token } : null;
      },
      send: async (to, link) => (await deliver(db, signInEmail(to, link))).sent,
    },
  );
  return back(code === 'email_link_sent' ? page + '&sent=1' : page, code);
};
