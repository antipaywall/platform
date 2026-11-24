// Handing off what you started: "Looking for a new owner", with the terms the original builder sets.
// Antipaywall shows the terms and never enforces them or handles money.

import type { SupabaseClient } from '@supabase/supabase-js';

export const ADOPTION_TERMS = [
  { key: 'open_source', label: 'Keep it open source' },
  { key: 'credit', label: 'Credit me' },
  { key: 'advise', label: "Stay in touch: I'll advise" },
  { key: 'ask_first', label: 'Talk to me before you take it' },
] as const;
export type TermKey = (typeof ADOPTION_TERMS)[number]['key'];
export const termLabel = (k: string) => ADOPTION_TERMS.find((t) => t.key === k)?.label ?? k;

export function parseTerms(form: FormData): TermKey[] {
  const chosen = new Set(form.getAll('terms').map(String));
  return ADOPTION_TERMS.map((t) => t.key).filter((k) => chosen.has(k));
}

export type Subject = { kind: 'project'; fullName: string } | { kind: 'gap'; authorId?: string | null; startedBy: string | null; claimers: string[] };

/** A repo's owner can hand off their project; a gap's starter or a builder on it can hand off the gap. */
export function canOffer(s: Subject, who: { login: string; personId: string }): boolean {
  const me = who.login.toLowerCase();
  if (s.kind === 'project') return s.fullName.split('/')[0].toLowerCase() === me;
  if (s.claimers.includes(who.personId)) return true;
  // The person who posted it, by account; the login only for ideas added straight on GitHub.
  if (s.authorId) return s.authorId === who.personId;
  return s.startedBy?.toLowerCase() === me;
}

export type Adoption = {
  id: string; offeredById: string; offeredBy: { username: string; name: string | null }; terms: string[]; note: string | null;
  interest: { username: string; name: string | null; note: string | null; personId: string }[];
};

/** The open handoff on a project or gap, if there is one, with who'd take it over. */
export async function openAdoption(db: SupabaseClient, kind: 'project' | 'gap', id: string): Promise<Adoption | null> {
  const { data } = await db
    .from('adoptions')
    .select('id, terms, note, offered_by, people:offered_by(username, handle, name), adoption_interest(person_id, note, people:person_id(username, handle, name))')
    .eq('subject_kind', kind)
    .eq('subject_id', id)
    .eq('status', 'open')
    .maybeSingle();
  if (!data) return null;
  const d: any = data;
  return {
    id: d.id,
    offeredById: d.offered_by,
    offeredBy: { username: d.people?.username ?? d.people?.handle ?? 'someone', name: d.people?.name ?? null },
    terms: d.terms ?? [],
    note: d.note,
    interest: (d.adoption_interest ?? []).map((i: any) => ({ username: i.people?.username ?? i.people?.handle ?? 'someone', name: i.people?.name ?? null, note: i.note, personId: i.person_id })),
  };
}
