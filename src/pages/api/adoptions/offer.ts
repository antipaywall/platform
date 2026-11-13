import type { APIRoute } from 'astro';
import { canOffer, parseTerms } from '../../../lib/adoptions';
import { back, safeNext } from '../../../lib/respond';
import { adminClient } from '../../../lib/supabase';

// Offer a project or gap you started to a new owner, with your terms. Builders only.
export const POST: APIRoute = async ({ request, locals }) => {
  const form = await request.formData();
  const next = safeNext(String(form.get('next') ?? ''), '/');
  const person = locals.person;
  if (!person) return back(next, 'need_signin');
  const kind = String(form.get('subject_kind') ?? '');
  const id = String(form.get('subject_id') ?? '');
  if (!['project', 'gap'].includes(kind) || !/^[0-9a-f-]{36}$/.test(id)) return back(next, 'save_failed');
  const db = adminClient();
  if (!db) return back(next, 'save_failed');
  const login = person.username;
  if (!login) return back('/auth/username', 'need_username');
  let subject;
  if (kind === 'project') {
    const { data } = await db.from('projects').select('full_name').eq('id', id).maybeSingle();
    if (!data) return back(next, 'save_failed');
    subject = { kind: 'project' as const, fullName: data.full_name as string };
  } else {
    const { data } = await db.from('ideas').select('started_by_login, author_id, gap_claims(person_id)').eq('id', id).maybeSingle();
    if (!data) return back(next, 'save_failed');
    subject = { kind: 'gap' as const, authorId: data.author_id, startedBy: data.started_by_login, claimers: ((data as any).gap_claims ?? []).map((c: any) => c.person_id) };
  }
  if (!canOffer(subject, { login, personId: person.id })) return back(next, 'not_yours_to_offer');
  const note = String(form.get('note') ?? '').replace(/\s+/g, ' ').trim().slice(0, 500) || null;
  const { error } = await db.from('adoptions').insert({ subject_kind: kind, subject_id: id, offered_by: person.id, terms: parseTerms(form), note });
  return back(next, error ? (error.code === '23505' ? 'already_offered' : 'save_failed') : 'offered');
};
