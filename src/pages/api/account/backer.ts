import type { APIRoute } from 'astro';
import { back } from '../../../lib/respond';
import { adminClient } from '../../../lib/supabase';

// An email backer's name, a line about them, and whether their page is public.
export const POST: APIRoute = async ({ request, locals }) => {
  const backer = locals.backer;
  if (!backer) return back('/auth/email', 'need_signin');
  const page = `/people/${backer.id}`;
  const form = await request.formData();
  const name = String(form.get('name') ?? '').replace(/\s+/g, ' ').trim();
  const about = String(form.get('about') ?? '').replace(/\s+/g, ' ').trim();
  if (name.length > 60) return back(page, 'bad_name');
  if (about.length > 400) return back(page, 'bad_about');
  const db = adminClient();
  if (!db) return back(page, 'save_failed');
  const { error } = await db.from('backers').update({ name: name || null, about: about || null, public: form.get('public') === '1' }).eq('id', backer.id);
  return back(page, error ? 'save_failed' : 'profile_saved');
};
