import type { APIRoute } from 'astro';
import { lookupTool } from '../../../lib/askedTools';
import { addMyTool } from '../../../lib/myTools';
import { takeSlot } from '../../../lib/ratelimit';
import { senderKey } from '../../../lib/requester';
import { parseDomain } from '../../../lib/siteReader';
import { adminClient } from '../../../lib/supabase';

/** New websites one connection may look up in an hour while onboarding, same as /api/find. */
const MAX_PER_HOUR = 10;
const MAX_ALL_PER_HOUR = 150;

// Onboarding: "what do you pay for?" Someone types a tool's name or pastes its website, and it
// goes on their list through myTools (the same list the MCP's my_tools uses). A website nobody
// has looked up yet is read and searched for once first, like /api/find. A plain form post that
// redirects back to /welcome, which shows what happened.
export const POST: APIRoute = async (context) => {
  const { request, locals, redirect } = context;
  const userId = locals.userId;
  if (!userId) return redirect('/signin?next=/welcome', 303);
  const form = await request.formData().catch(() => null);
  const raw = String(form?.get('tool') ?? '').trim().slice(0, 200);
  const nextRaw = String(form?.get('next') ?? '');
  const next = nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '';
  const back = (q: Record<string, string>) => redirect(`/welcome?${new URLSearchParams({ ...q, ...(next ? { next } : {}) })}`, 303);
  if (!raw) return back({});
  const db = adminClient();
  if (!db) return back({ e: 'busy' });

  try {
    // People type a name ("Calendly") or paste a website. Names become a catalog slug, or the
    // website of a tool someone already looked up; anything else is tried as a website.
    const lower = raw.toLowerCase();
    const plain = lower.replace(/[%_\\]/g, '');
    let key = raw;
    let { data: byName } = await db.from('products').select('slug').ilike('name', plain).limit(1).maybeSingle();
    if (!byName) ({ data: byName } = await db.from('products').select('slug').contains('aliases', [lower]).limit(1).maybeSingle());
    if (byName) key = byName.slug;
    else if (!parseDomain(raw)) {
      const { data: asked } = await db.from('asked_tools').select('domain').ilike('name', plain).neq('status', 'hidden').limit(1).maybeSingle();
      if (!asked) return back({ e: 'unknown', tool: raw });
      key = asked.domain;
    }

    let result = await addMyTool(db, userId, key);
    let isNew = false;
    if (!result.ok && result.reason === 'not_looked_up') {
      // A website nobody has looked up: read it once, with the same limits as /api/find.
      const domain = parseDomain(key)!;
      const sender = senderKey(context);
      const limited = (sender && (await takeSlot(db, 'find', sender, MAX_PER_HOUR)) === 'limited') || (await takeSlot(db, 'find-all', 'all', MAX_ALL_PER_HOUR)) === 'limited';
      if (limited) return back({ e: 'limit' });
      await lookupTool(db, domain, { token: import.meta.env.GITHUB_TOKEN });
      isNew = true;
      result = await addMyTool(db, userId, domain);
    }
    if (!result.ok) return back({ e: result.reason === 'too_many' ? 'too_many' : result.reason === 'unknown' ? 'unknown' : 'busy', tool: raw });
    const t = result.tool;
    return back({ added: t.kind === 'catalog' ? t.slug : t.domain, kind: t.kind, ...(isNew ? { new: '1' } : {}) });
  } catch {
    return back({ e: 'busy' });
  }
};
