import type { APIRoute } from 'astro';
import { isAdmin } from '../../../lib/db';
import { leaveList } from '../../../lib/list';
import { back } from '../../../lib/respond';
import { adminClient, sessionClient } from '../../../lib/supabase';

// Deletes a signed-in person's own account. Removing the sign-in user removes their row, and the
// database takes their ideas, pledge, panel and organize entries and recorded actions with it.
// Their address can also come off the email list; otherwise it stays as a plain address.
export const POST: APIRoute = async (context) => {
  const { request, cookies, locals } = context;
  const person = locals.person;
  const db = adminClient();
  if (!person || !db) return back('/account', 'need_signin');
  const form = await request.formData();
  if (form.get('confirm') !== 'on') return back('/account#delete', 'need_delete_confirm');
  // The organizer's account holds the site's own pledge and admin access, so it can't be deleted from here.
  if (isAdmin(person)) return back('/account#delete', 'organizer_cannot_delete');
  if (form.get('leave_list') === 'on') {
    const { data } = await db.from('subscribers').select('token').eq('person_id', person.id).is('unsubscribed_at', null);
    for (const r of data ?? []) await leaveList(db, context, r.token, false);
  }
  const { error } = await db.auth.admin.deleteUser(person.id);
  if (error) return back('/account#delete', 'save_failed');
  // The user is already gone, so only this browser's session cookies are cleared.
  await sessionClient(request, cookies)?.auth.signOut({ scope: 'local' });
  return back('/', 'account_deleted');
};
