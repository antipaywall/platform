import type { APIRoute } from 'astro';
import { getPeople, isAdmin } from '../../../lib/db';
import { toCsv } from '../../../lib/intake';
import { buildEntries, filterEntries, PEOPLE_CSV_HEADER, peopleCsvRows } from '../../../lib/report';

// Everyone who signed up for anything, as a file: what each signed up for, and where they came
// from when that is known. Organizer only; everyone else gets a plain 404. It includes email
// addresses, and takes the same filter and search as the people page.
export const GET: APIRoute = async ({ locals, url }) => {
  if (!isAdmin(locals.person)) return new Response(null, { status: 404 });
  const entries = filterEntries(buildEntries(await getPeople()), { kind: url.searchParams.get('kind'), q: url.searchParams.get('q') });
  const day = new Date().toISOString().slice(0, 10);
  return new Response(toCsv(PEOPLE_CSV_HEADER, peopleCsvRows(entries)), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="antipaywall-people-${day}.csv"`,
      'cache-control': 'private, no-store',
    },
  });
};
