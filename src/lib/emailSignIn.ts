// Signing in with an email link, for backers without GitHub or GitLab. The link is made by
// Supabase on our server and sent by our own email, from Antipaywall, so the email looks like
// ours and lands on our own page.

import { parseEmail } from './intake';
import type { MessageCode } from './respond';

export function signInLink(origin: string, hashedToken: string, next: string): string {
  const q = new URLSearchParams({ provider: 'email', token_hash: hashedToken, type: 'magiclink', next });
  return `${origin}/auth/callback?${q}`;
}

export type EmailLinkDeps = {
  /** Rate limits for this connection and this address. */
  allowed: (email: string) => Promise<boolean>;
  /** Makes a one-time sign-in token for the address, creating the account if needed. Null when it can't. */
  generate: (email: string) => Promise<{ hashedToken: string } | null>;
  send: (to: string, link: string) => Promise<boolean>;
};

/**
 * Sends a sign-in link. The answer is the same whether the address has an account or not, and
 * whether the email went out, so the form can't be used to find out who has signed up.
 */
export async function requestEmailLink(input: { email: unknown; next: string; origin: string }, deps: EmailLinkDeps): Promise<MessageCode> {
  const email = parseEmail(input.email);
  if (!email) return 'bad_email';
  if (!(await deps.allowed(email))) return 'too_many';
  const made = await deps.generate(email).catch(() => null);
  if (made) await deps.send(email, signInLink(input.origin, made.hashedToken, input.next)).catch(() => false);
  return 'email_link_sent';
}
