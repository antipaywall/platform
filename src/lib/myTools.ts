// "My tools": the paid tools a signed-in person says they pay for today. It is the site's most
// direct picture of what people want replaced. Onboarding and the MCP both go through here, so
// where it is stored is decided in one place.
//
// A tool in the catalog is kept as a row in paid_tools: its own table, so it never inflates
// "I'd pay if it worked", which is a signal with an amount attached and a different statement.
// A tool looked up by its website is kept by counting the person among those who asked about it.

import type { SupabaseClient } from '@supabase/supabase-js';
import { catalogSlugFor, getAsked } from './askedTools';
import { parseDomain } from './siteReader';

export const MAX_MY_TOOLS = 60;

export type MyTool = { kind: 'catalog'; slug: string; name: string } | { kind: 'asked'; domain: string; name: string };

const asker = (personId: string) => `u:${personId}`;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Everything this person says they pay for, catalog tools first. */
export async function listMyTools(db: SupabaseClient, personId: string): Promise<MyTool[]> {
  const [signals, asked] = await Promise.all([
    db.from('paid_tools').select('product_id').eq('person_id', personId).limit(MAX_MY_TOOLS),
    db.from('asked_tools').select('domain, name').neq('status', 'hidden').contains('askers', [asker(personId)]).order('name').limit(MAX_MY_TOOLS),
  ]);
  if (signals.error) throw new Error(signals.error.message);
  if (asked.error) throw new Error(asked.error.message);
  const ids = (signals.data ?? []).map((s) => s.product_id as string);
  const products = ids.length ? await db.from('products').select('slug, name').in('id', ids).order('name') : { data: [], error: null };
  if (products.error) throw new Error(products.error.message);
  return [
    ...((products.data ?? []) as { slug: string; name: string }[]).map((p) => ({ kind: 'catalog' as const, slug: p.slug, name: p.name })),
    ...((asked.data ?? []) as { domain: string; name: string }[]).map((t) => ({ kind: 'asked' as const, domain: t.domain, name: t.name })),
  ];
}

/**
 * What someone typed, as one of the two kinds of tool: a catalog slug ("calendly"), or a website
 * ("annot.io"). A website that belongs to a catalog tool is that tool. Null when it is neither.
 */
export async function resolveTool(db: SupabaseClient, input: string): Promise<{ kind: 'catalog'; slug: string } | { kind: 'asked'; domain: string } | null> {
  const raw = input.trim().toLowerCase().slice(0, 200);
  if (SLUG.test(raw) && raw.length <= 60) {
    const { data } = await db.from('products').select('slug').eq('slug', raw).maybeSingle();
    if (data) return { kind: 'catalog', slug: data.slug };
  }
  const domain = parseDomain(raw);
  if (!domain) return null;
  const slug = await catalogSlugFor(db, domain);
  return slug ? { kind: 'catalog', slug } : { kind: 'asked', domain };
}

export type AddResult = { ok: true; tool: MyTool; already: boolean } | { ok: false; reason: 'unknown' | 'not_looked_up' | 'too_many' | 'failed' };

/**
 * Adds a tool to the person's list. A website nobody has looked up yet is refused with
 * 'not_looked_up': the caller looks it up first (that costs a page read and GitHub searches, and
 * has its own limits), then adds it.
 */
export async function addMyTool(db: SupabaseClient, personId: string, input: string): Promise<AddResult> {
  const tool = await resolveTool(db, input);
  if (!tool) return { ok: false, reason: 'unknown' };
  if ((await listMyTools(db, personId)).length >= MAX_MY_TOOLS) return { ok: false, reason: 'too_many' };
  if (tool.kind === 'catalog') {
    const { data: p } = await db.from('products').select('id, slug, name').eq('slug', tool.slug).maybeSingle();
    if (!p) return { ok: false, reason: 'unknown' };
    const { data: had } = await db.from('paid_tools').select('product_id').eq('person_id', personId).eq('product_id', p.id).limit(1);
    if (had?.length) return { ok: true, tool: { kind: 'catalog', slug: p.slug, name: p.name }, already: true };
    const { error } = await db.from('paid_tools').insert({ person_id: personId, product_id: p.id });
    return error ? { ok: false, reason: 'failed' } : { ok: true, tool: { kind: 'catalog', slug: p.slug, name: p.name }, already: false };
  }
  const known = await getAsked(db, tool.domain);
  if (!known || known.status === 'hidden') return { ok: false, reason: known ? 'unknown' : 'not_looked_up' };
  const { data } = await db.from('asked_tools').select('askers').eq('domain', tool.domain).maybeSingle();
  const askers: string[] = data?.askers ?? [];
  const already = askers.includes(asker(personId));
  if (!already) {
    const { error } = await db.from('asked_tools').update({ askers: [...askers, asker(personId)] }).eq('domain', tool.domain);
    if (error) return { ok: false, reason: 'failed' };
  }
  return { ok: true, tool: { kind: 'asked', domain: tool.domain, name: known.name }, already };
}

/** Takes a tool off the person's list. True when it was on it. Touches only this person's own entry. */
export async function removeMyTool(db: SupabaseClient, personId: string, input: string): Promise<boolean> {
  const tool = await resolveTool(db, input);
  if (!tool) return false;
  if (tool.kind === 'catalog') {
    const { data: p } = await db.from('products').select('id').eq('slug', tool.slug).maybeSingle();
    if (!p) return false;
    const { data, error } = await db.from('paid_tools').delete().eq('person_id', personId).eq('product_id', p.id).select('product_id');
    if (error) throw new Error(error.message);
    return (data ?? []).length > 0;
  }
  const { data } = await db.from('asked_tools').select('askers').eq('domain', tool.domain).maybeSingle();
  const askers: string[] = data?.askers ?? [];
  if (!askers.includes(asker(personId))) return false;
  const { error } = await db.from('asked_tools').update({ askers: askers.filter((a) => a !== asker(personId)) }).eq('domain', tool.domain);
  if (error) throw new Error(error.message);
  return true;
}
