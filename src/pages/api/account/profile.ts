import type { APIRoute } from 'astro';
import { parseAccountProfile } from '../../../lib/forms';
import { back } from '../../../lib/respond';
import { adminClient } from '../../../lib/supabase';

// Saves what a signed-in person writes about themselves. Only ever their own row.
export const POST: APIRoute = async ({ request, locals }) => {
  const person = locals.person;
  const db = adminClient();
  if (!person || !db) return back('/account', 'need_signin');
  const form = await request.formData();
  const parsed = parseAccountProfile({
    about: form.get('about'), skills: form.get('skills'), xHandle: form.get('x_handle'), siteUrl: form.get('site_url'),
    openToTeam: form.get('open_to_team'), teamNote: form.get('team_note'), profilePublic: form.get('profile_public'),
  });
  if (!parsed.ok) return back('/account', parsed.error);
  const p = parsed.profile;
  const { error } = await db.from('people').update({
    about: p.about, skills: p.skills, x_handle: p.xHandle, site_url: p.siteUrl,
    open_to_team: p.openToTeam, team_note: p.teamNote,
    // A builder's profile is always public; the switch is only for everyone else.
    profile_public: person.is_builder ? person.profile_public ?? false : p.profilePublic,
  }).eq('id', person.id);
  return back('/account', error ? 'save_failed' : 'profile_saved');
};
