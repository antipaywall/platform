import type { APIRoute } from 'astro';
import { isAdmin } from '../../../lib/db';
import { sendEmail } from '../../../lib/email';
import { alreadySent, type Audience, checkMailing, getMailing, recipients, sendMailing, testedSinceEdit, testEmail } from '../../../lib/mailings';
import { back } from '../../../lib/respond';
import { adminClient } from '../../../lib/supabase';

// Emails to the list. Organizer only.
//   create: save a new email.  save: change one that has not gone out to anyone yet.
//   test: send a copy to the organizer's own inbox.  send: send it to everyone it is for who
//   has not had it yet. Sending needs a test after the last edit, a ticked box, and the same
//   number of people the organizer saw on the page.
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!isAdmin(locals.person)) return new Response(null, { status: 404 });
  const db = adminClient();
  if (!db) return back('/admin/email', 'save_failed');
  const form = await request.formData();
  const action = String(form.get('action') ?? '');
  const fields = { subject: String(form.get('subject') ?? ''), body: String(form.get('body') ?? '').replace(/\r\n/g, '\n'), audience: String(form.get('audience') ?? '') };
  try {
    if (action === 'create') {
      if (checkMailing(fields)) return back('/admin/email#new', 'mail_bad');
      const { data, error } = await db.from('mailings').insert({ ...fields, created_by: locals.person!.id }).select('id').single();
      if (error || !data) return back('/admin/email#new', 'save_failed');
      return back(`/admin/email/${data.id}`, 'mail_saved');
    }
    const mailing = await getMailing(db, String(form.get('id') ?? ''));
    if (!mailing) return back('/admin/email', 'save_failed');
    const page = `/admin/email/${mailing.id}`;
    if (action === 'save') {
      if (checkMailing(fields)) return back(page, 'mail_bad');
      if ((await alreadySent(db, mailing.id)).size > 0) return back(page, 'mail_locked');
      const { error } = await db.from('mailings').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', mailing.id);
      return back(page, error ? 'save_failed' : 'mail_saved');
    }
    if (action === 'test') {
      const result = await sendEmail(testEmail(mailing), { timeoutMs: 8000 });
      if (!result.sent) return back(page, result.reason === 'no_key' ? 'mail_no_key' : 'mail_test_failed');
      const stamped = await db.from('mailings').update({ tested_at: new Date().toISOString() }).eq('id', mailing.id);
      if (stamped.error) return back(page, 'save_failed');
      return back(page, 'mail_tested');
    }
    if (action === 'send') {
      if (!testedSinceEdit(mailing) || form.get('confirm') !== 'yes') return back(page, 'mail_needs_test');
      const done = await alreadySent(db, mailing.id);
      const waiting = (await recipients(db, mailing.audience as Audience)).filter((r) => !done.has(r.id)).length;
      if (String(waiting) !== String(form.get('expected') ?? '')) return back(page, 'mail_count_changed');
      const outcome = await sendMailing(db, mailing);
      if (outcome.error === 'no_key') return back(page, 'mail_no_key');
      return back(page, outcome.error ? 'mail_partial' : 'mail_sent');
    }
  } catch {
    return back('/admin/email', 'save_failed');
  }
  return redirect('/admin/email', 303);
};
