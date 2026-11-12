import type { SupabaseClient } from '@supabase/supabase-js';
import type { APIContext } from 'astro';
import { countryCode, isProduction, visitorHash } from './analytics';
import { isAdmin, type Person } from './db';
import { clientIp, VISITOR_KEY } from './requester';

// What people did, recorded so the organizer can see it next to the pages viewed that day.
//
// Each action is stored with the day and the same one-day visitor code a page view gets
// (a keyed hash of the date, the IP address and the browser name), so the two can be read
// together. No cookie is used. The code changes every day, so an action can only ever be
// matched to pages viewed on the same day, from the same browser and network.
//
// Like page views, actions are recorded on the live site only.

export const EVENT_KINDS = [
  'signed_in', 'checks_passed', 'checks_failed', 'joined_builder', 'list_joined', 'pledged',
  'idea_posted', 'hearted', 'panel_applied', 'organize_offered', 'sponsor_inquiry', 'unsubscribed',
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/** The actions that count as signing up for something. The database uses the same list (`signup_kinds`). */
export const SIGNUP_KINDS: readonly EventKind[] = ['signed_in', 'joined_builder', 'list_joined', 'pledged', 'panel_applied', 'organize_offered', 'sponsor_inquiry'];

export const EVENT_LABELS: Record<EventKind, string> = {
  signed_in: 'Signed in',
  checks_passed: 'Passed the builder checks',
  checks_failed: 'Did not pass the builder checks',
  joined_builder: 'Joined as a builder',
  list_joined: 'Joined the email list',
  pledged: 'Pledged',
  idea_posted: 'Posted an idea',
  hearted: 'Hearted an idea',
  panel_applied: 'Applied to the review panel',
  organize_offered: 'Offered to help organize',
  sponsor_inquiry: 'Sent a sponsor inquiry',
  unsubscribed: 'Left the email list',
};

export type EventRow = {
  day: string;
  visitor: string | null;
  kind: EventKind;
  person_id: string | null;
  subject: string | null;
  country: string | null;
};

/** A short reference only: an idea's slug or a row's id. Free text and email addresses never pass. */
export function eventSubject(v: string | null | undefined): string | null {
  return v && /^[A-Za-z0-9_-]{1,80}$/.test(v) ? v : null;
}

/**
 * Builds the row for an action. Pure: the caller supplies the key, the IP and the clock.
 * The visitor code is left out when it could not match any page view: the organizer's own
 * visits are not counted, and `anonymous` is for requests that do not come from the
 * person's browser (a mail app pressing its unsubscribe button).
 */
export function eventFor(input: {
  kind: EventKind; personId?: string | null; subject?: string | null;
  headers: Headers; ip: string; key: string; now: Date; organizer: boolean; anonymous?: boolean;
}): EventRow {
  const day = input.now.toISOString().slice(0, 10);
  const ua = input.headers.get('user-agent');
  const linkable = !input.organizer && !input.anonymous && Boolean(input.key && input.ip && ua);
  return {
    day,
    visitor: linkable ? visitorHash(input.key, day, input.ip, ua!) : null,
    kind: input.kind,
    person_id: input.personId ?? null,
    subject: eventSubject(input.subject),
    country: countryCode(input.headers.get('x-vercel-ip-country')),
  };
}

type Requester = Pick<APIContext, 'request' | 'clientAddress'> & { locals?: { person?: Person | null } };

/**
 * Records one action. Never throws and never fails the request it is part of: a lost
 * record is better than a failed sign-up. Waits a moment for the write, then moves on.
 */
export async function recordEvent(
  db: SupabaseClient, context: Requester,
  what: { kind: EventKind; personId?: string | null; subject?: string | null; anonymous?: boolean; organizer?: boolean },
): Promise<void> {
  try {
    if (!isProduction(process.env.VERCEL_ENV)) return;
    const row = eventFor({
      ...what, headers: context.request.headers, ip: clientIp(context), key: VISITOR_KEY, now: new Date(),
      organizer: what.organizer ?? isAdmin(context.locals?.person),
    });
    const write = Promise.resolve(db.from('events').insert(row)).then(() => undefined, () => undefined);
    await Promise.race([write, new Promise<void>((done) => setTimeout(done, 400))]);
  } catch {
    // Deliberately ignored.
  }
}
