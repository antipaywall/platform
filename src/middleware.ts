import { defineMiddleware } from 'astro:middleware';
import { ADMIN_HEADERS, isAdminPath } from './lib/admin';
import { isProduction, pageViewFor } from './lib/analytics';
import { attempt, getPerson, isAdmin } from './lib/db';
import { getBacker } from './lib/backers';
import { allowedRequest } from './lib/origin';
import { clientIp, VISITOR_KEY } from './lib/requester';
import { adminClient, sessionClient } from './lib/supabase';

type Context = Parameters<Parameters<typeof defineMiddleware>[0]>[0];

/** Counts this page view, if it is one. Never throws, and never holds the page up for long. */
function countView(context: Context): Promise<void> {
  // Only the live site counts anything: decided first, so local and preview copies do no work here.
  if (!isProduction(process.env.VERCEL_ENV)) return Promise.resolve();
  const db = adminClient();
  if (!db || !VISITOR_KEY) return Promise.resolve();
  const view = pageViewFor({
    method: context.request.method, url: context.url, headers: context.request.headers,
    ip: clientIp(context), key: VISITOR_KEY, now: new Date(),
    production: true, organizer: isAdmin(context.locals.person),
  });
  if (!view) return Promise.resolve();
  const write = Promise.resolve(db.from('page_views').insert(view)).then(() => undefined, () => undefined);
  // The write runs while the page renders. If it is still going after that, wait a moment and then give up on it.
  return Promise.race([write, new Promise<void>((done) => setTimeout(done, 250))]);
}

// Refuses cross-site writes, reads the visitor's session if they have one, loads their row,
// counts the page view, and marks the organizer's pages as private.
export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.person = null;
  context.locals.userId = null;
  context.locals.backer = null;
  // Anything that changes something must come from one of our own pages.
  if (!allowedRequest({ method: context.request.method, origin: context.request.headers.get('origin'), self: context.url.origin, path: context.url.pathname })) {
    return new Response('Cross-site requests are not accepted.', { status: 403 });
  }
  const cookie = context.request.headers.get('cookie') ?? '';
  if (cookie.includes('sb-')) {
    const supabase = sessionClient(context.request, context.cookies);
    const { data } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
    const user = data.user;
    if (user) {
      context.locals.userId = user.id;
      context.locals.person = await attempt(() => getPerson(user.id));
      // Someone who signed in with an email link has no person row; they are a backer.
      if (!context.locals.person) context.locals.backer = await attempt(() => getBacker(user.id));
    }
  }
  // Counted after the session is read, so an organizer's own visits are left out.
  const counted = countView(context).catch(() => undefined);
  const response = await next();
  await counted;
  if (isAdminPath(context.url.pathname)) {
    for (const [name, value] of Object.entries(ADMIN_HEADERS)) response.headers.set(name, value);
  }
  return response;
});
