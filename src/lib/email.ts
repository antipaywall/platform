import type { SupabaseClient } from '@supabase/supabase-js';
import { site } from '../config/site';
import { MAX_EMAILS_PER_HOUR, takeSlot } from './ratelimit';

export const FROM = 'Antipaywall <hello@antipaywall.org>';
/** Where notices for the organizer go. It forwards to him. */
export const ORGANIZER = 'hello@antipaywall.org';

export type Email = { to: string; subject: string; text: string; html: string; oneClickUrl?: string };
export type SendResult = { sent: true; id: string } | { sent: false; reason: 'no_key' | 'refused' | 'unreachable' | 'capped' };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Plain text as simple HTML: escaped, one paragraph per blank-line block, links left as text. */
const asHtml = (text: string) =>
  text.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('\n');

/** The page a person opens to leave the list. It asks them to confirm; opening it changes nothing. */
export const unsubscribeUrl = (token: string) => `${site.origin}/unsubscribe?t=${encodeURIComponent(token)}`;
/** Where a mail app posts when its own "unsubscribe" button is pressed. Only a POST does anything. */
export const oneClickUrl = (token: string) => `${site.origin}/api/list-unsubscribe?t=${encodeURIComponent(token)}`;

/** The one email a new subscriber gets. It says what the list is for and how to leave it. */
export function welcomeEmail(to: string, token: string): Email {
  const url = unsubscribeUrl(token);
  const text = [
    `You're on the email list for ${site.name}, a free open-source hackathon. The dates have not been announced yet.`,
    'We will email you when something real happens: the dates being set, the pool opening, the results. Nothing else, and never anyone else\'s marketing.',
    `If you didn't ask for this, or you change your mind, unsubscribe here:\n${url}`,
    `Ethan Rogers, organizer\n${site.origin}`,
  ].join('\n\n');
  return { to, subject: `You're on the ${site.name} list`, text, html: asHtml(text), oneClickUrl: oneClickUrl(token) };
}

/** A notice to the organizer that someone filled in a form. Every value is shown as plain text. */
export function organizerNotice(what: string, lines: [string, string][]): Email {
  const text = [`${what}, sent from ${site.origin}.`, lines.map(([k, v]) => `${k}: ${v || '(blank)'}`).join('\n'), `See it in the admin: ${site.origin}/admin`].join('\n\n');
  return { to: ORGANIZER, subject: `${site.name}: ${what}`, text, html: asHtml(text) };
}

/** The request body Resend expects for one email. */
export function resendBody(email: Email) {
  return {
    from: FROM,
    to: [email.to],
    reply_to: ORGANIZER,
    subject: email.subject,
    text: email.text,
    html: email.html,
    // Lets a mail app offer its own unsubscribe button. The app sends a POST, never a GET,
    // so a scanner that merely opens links cannot unsubscribe anyone.
    ...(email.oneClickUrl
      ? { headers: { 'List-Unsubscribe': `<${email.oneClickUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }
      : {}),
  };
}

/**
 * Sends one email through Resend. Without a key it sends nothing and says so.
 * It never throws: a caller's own work must not fail because an email did.
 */
export async function sendEmail(
  email: Email,
  opts: { key?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<SendResult> {
  const key = opts.key ?? (import.meta.env.RESEND_API_KEY as string | undefined);
  if (!key) return { sent: false, reason: 'no_key' };
  try {
    const res = await (opts.fetchImpl ?? fetch)('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(resendBody(email)),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 4000),
    });
    if (!res.ok) return { sent: false, reason: 'refused' };
    const body = (await res.json().catch(() => null)) as { id?: unknown } | null;
    return { sent: true, id: typeof body?.id === 'string' ? body.id : '' };
  } catch {
    return { sent: false, reason: 'unreachable' };
  }
}

/**
 * Sends one email, unless the site has already sent its hourly allowance. The allowance
 * exists so a script cannot use our forms to spend the sending quota or hurt the domain's
 * reputation. A capped email is simply not sent; whatever triggered it is still saved.
 */
export async function deliver(db: SupabaseClient, email: Email, opts: Parameters<typeof sendEmail>[1] = {}): Promise<SendResult> {
  const key = opts.key ?? (import.meta.env.RESEND_API_KEY as string | undefined);
  if (!key) return { sent: false, reason: 'no_key' };
  if ((await takeSlot(db, 'email', 'all', MAX_EMAILS_PER_HOUR)) !== 'ok') return { sent: false, reason: 'capped' };
  return sendEmail(email, opts);
}
