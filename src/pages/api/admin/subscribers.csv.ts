import type { APIRoute } from 'astro';
import { isAdmin, listSubscribers } from '../../../lib/db';
import { unsubscribeUrl } from '../../../lib/email';
import { toCsv } from '../../../lib/intake';

// The email list as a file. Organizer only; everyone else gets a plain 404.
// Unsubscribed addresses are included and marked, so they are never mailed by mistake.
// Each row carries that address's own unsubscribe link, so anything sent to the list can
// include it and an unsubscribe always lands back in this site's records.
export const GET: APIRoute = async ({ locals }) => {
  if (!isAdmin(locals.person)) return new Response(null, { status: 404 });
  const rows = await listSubscribers();
  const csv = toCsv(
    ['email', 'status', 'joined_by', 'country', 'subscribed_at', 'unsubscribed_at', 'unsubscribe_link'],
    rows.map((r) => [r.email, r.unsubscribed_at ? 'unsubscribed' : 'subscribed', r.source, r.country ?? '', r.subscribed_at, r.unsubscribed_at ?? '', unsubscribeUrl(r.token)]),
  );
  const day = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="antipaywall-email-list-${day}.csv"`,
      'cache-control': 'private, no-store',
    },
  });
};
