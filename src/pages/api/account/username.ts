import type { APIRoute } from 'astro';
import { takeSlot } from '../../../lib/ratelimit';
import { back, safeNext } from '../../../lib/respond';
import { adminClient } from '../../../lib/supabase';
import { checkChosen, githubHasUser, holderIn, setUsername } from '../../../lib/usernames';

// A builder picks their own username (after a collision at sign-in).
export const POST: APIRoute = async ({ request, locals }) => {
  const person = locals.person;
  if (!person) return back('/signin', 'need_signin');
  const form = await request.formData();
  const next = safeNext(String(form.get('next') ?? ''), '/');
  const page = `/auth/username?next=${encodeURIComponent(next)}`;
  const db = adminClient();
  if (!db) return back(page, 'save_failed');
  // Each try asks GitHub with the site's shared allowance, so tries are limited per person.
  if ((await takeSlot(db, 'username', person.id, 10)) !== 'ok') return back(page, 'too_many');
  const checked = await checkChosen(person.id, String(form.get('username') ?? ''), holderIn(db), (n) => githubHasUser(n));
  if (!checked.ok) {
    const code = checked.reason === 'taken' ? 'username_taken' : checked.reason === 'on_github' ? 'username_on_github' : checked.reason === 'github_unreachable' ? 'github_unavailable' : 'bad_username';
    return back(page, code);
  }
  if (!(await setUsername(db, person.id, checked.username))) return back(page, 'save_failed');
  return back(next, 'username_saved');
};
