import type { APIRoute } from 'astro';
import { leaveList } from '../../../lib/list';
import { back } from '../../../lib/respond';
import { adminClient } from '../../../lib/supabase';

// Takes a signed-in person's own sign-in address off the email list.
export const POST: APIRoute = async (context) => {
  const person = context.locals.person;
  const db = adminClient();
  if (!person || !db) return back('/account#email', 'need_signin');
  const { data } = await db.from('subscribers').select('token').eq('person_id', person.id).is('unsubscribed_at', null);
  for (const r of data ?? []) await leaveList(db, context, r.token, false);
  return back('/account#email', 'done');
};
