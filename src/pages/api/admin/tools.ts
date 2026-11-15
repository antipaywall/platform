import type { APIRoute } from 'astro';
import { lookupTool } from '../../../lib/askedTools';
import { isAdmin } from '../../../lib/db';
import { back } from '../../../lib/respond';
import { parseDomain } from '../../../lib/siteReader';
import { adminClient } from '../../../lib/supabase';

const BACK = '/admin/tools';
const STATUS: Record<string, 'listed' | 'hidden' | 'new'> = { list: 'listed', hide: 'hidden', unlist: 'new' };

// Tools people looked up by pasting a website. Organizer only.
//   list: show it on /find. hide: take its page and search results away. unlist: back to "new".
//   refresh: read its website and search GitHub again.
// Nothing is ever deleted: a hidden tool stays, so the same address can't simply be asked for again.
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!isAdmin(locals.person)) return new Response(null, { status: 404 });
  const db = adminClient();
  if (!db) return back(BACK, 'save_failed');
  const form = await request.formData();
  const action = String(form.get('action') ?? '');
  const domain = parseDomain(String(form.get('domain') ?? ''));
  if (!domain) return back(BACK, 'save_failed');
  try {
    if (action in STATUS) {
      const { error } = await db.from('asked_tools').update({ status: STATUS[action] }).eq('domain', domain);
      if (error) throw new Error(error.message);
    } else if (action === 'refresh') {
      const { githubDown } = await lookupTool(db, domain, { token: import.meta.env.GITHUB_TOKEN });
      if (githubDown) return back(BACK, 'save_failed');
    } else {
      return back(BACK, 'save_failed');
    }
  } catch {
    return back(BACK, 'save_failed');
  }
  return redirect(`${BACK}?done=${action}#${domain}`, 303);
};
