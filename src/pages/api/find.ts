import type { APIRoute } from 'astro';
import { catalogSlugFor, countAsk, getAsked, isStale, lookupTool } from '../../lib/askedTools';
import { takeSlot } from '../../lib/ratelimit';
import { senderKey } from '../../lib/requester';
import { parseDomain } from '../../lib/siteReader';
import { adminClient } from '../../lib/supabase';
import { ensureVisitorId } from '../../lib/visitor';

/** New websites one connection may have looked up in an hour, and the site as a whole. Each costs a page read and five GitHub searches. */
const MAX_PER_HOUR = 10;
const MAX_ALL_PER_HOUR = 150;

// Someone pasted the website of a tool they pay for. A tool we already track goes to its page;
// one we've looked up before goes to the saved answer; a new one is read and searched for once.
// A plain form post, so it works without scripts. No sign-in needed.
export const POST: APIRoute = async (context) => {
  const { request, cookies, url, locals, redirect } = context;
  const form = await request.formData().catch(() => null);
  // The search box posts its own field (`q`) when someone presses "Look up" in its results.
  const raw = String(form?.get('site') ?? form?.get('q') ?? '').trim().slice(0, 200);
  const fail = (e: 'bad' | 'busy' | 'limit') => redirect(`/find?site=${encodeURIComponent(raw)}&e=${e}`, 303);
  const domain = parseDomain(raw);
  if (!domain) return fail('bad');
  const db = adminClient();
  if (!db) return fail('busy');

  try {
    const slug = await catalogSlugFor(db, domain);
    if (slug) return redirect(`/free-alternatives/${slug}`, 303);
    const known = await getAsked(db, domain);
    if (known?.status === 'hidden') return fail('bad');
    if (!known || isStale(known)) {
      const sender = senderKey(context);
      const limited = (sender && (await takeSlot(db, 'find', sender, MAX_PER_HOUR)) === 'limited') || (await takeSlot(db, 'find-all', 'all', MAX_ALL_PER_HOUR)) === 'limited';
      // Over the limit, a saved answer is still shown as it is; only a new lookup is refused.
      if (limited && !known) return fail('limit');
      if (!limited) await lookupTool(db, domain, { token: import.meta.env.GITHUB_TOKEN }).catch((e) => { if (!known) throw e; });
    }
    await countAsk(db, domain, locals.userId ? `u:${locals.userId}` : `v:${ensureVisitorId(cookies, url.protocol === 'https:')}`);
  } catch {
    return fail('busy');
  }
  return redirect(`/find/${domain}`, 303);
};
