import type { APIRoute } from 'astro';
import { rulesVersion } from '../../config/site';
import { recordEvent } from '../../lib/events';
import { parseProfile } from '../../lib/forms';
import { back } from '../../lib/respond';
import { adminClient } from '../../lib/supabase';

export const POST: APIRoute = async (context) => {
  const { request, locals } = context;
  const person = locals.person;
  const db = adminClient();
  if (!person || !db) return back('/join/build', 'need_signin');
  if (!person.verified) return back('/join/build', 'not_verified');
  const form = await request.formData();
  if (form.get('rules') !== 'on') return back('/join/build', 'need_rules');
  const profile = parseProfile({ xHandle: form.get('x_handle'), siteUrl: form.get('site_url') });
  if (!profile.ok) return back('/join/build', profile.error);
  const now = new Date().toISOString();
  const { error } = await db.from('people').update({
    is_builder: true, x_handle: profile.xHandle, site_url: profile.siteUrl,
    rules_version: rulesVersion, rules_accepted_at: now, joined_at: now,
  }).eq('id', person.id);
  if (error) return back('/join/build', 'save_failed');
  // Saving the form again as a builder is an edit, not a second joining.
  if (!person.is_builder) await recordEvent(db, context, { kind: 'joined_builder', personId: person.id });
  return back('/join/build', 'joined');
};
