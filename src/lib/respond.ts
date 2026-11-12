/** Every message the site can show after an action. Pages receive a code, never free text, so a link cannot put words in the site's mouth. */
export const MESSAGES = {
  signin_unavailable: { kind: 'error', text: 'Sign-in is not set up yet.' },
  signin_failed: { kind: 'error', text: 'Sign-in did not finish. Try again.' },
  github_unavailable: { kind: 'error', text: "We couldn't reach GitHub to check your account. Sign in again in a minute." },
  gitlab_unavailable: { kind: 'error', text: "We couldn't reach GitLab to check your account. Sign in again in a minute." },
  signin_use_github: { kind: 'error', text: 'This account joined with GitHub. Sign in with GitHub to keep using it.' },
  signin_use_gitlab: { kind: 'error', text: 'This account joined with GitLab. Sign in with GitLab to keep using it.' },
  need_signin: { kind: 'error', text: 'Sign in with GitHub or GitLab first.' },
  not_verified: { kind: 'error', text: "Your account doesn't pass the builder checks yet." },
  need_rules: { kind: 'error', text: 'Tick the box to accept the rules.' },
  bad_x: { kind: 'error', text: 'That X handle does not look right.' },
  bad_site: { kind: 'error', text: 'Enter the site as a full address starting with https://, up to 200 characters.' },
  save_failed: { kind: 'error', text: 'That did not save. Try again.' },
  joined: { kind: 'ok', text: "You're in." },
  bad_amount: { kind: 'error', text: 'Enter an amount in dollars, like 25 or 25.50. The smallest pledge is $1.' },
  bad_name: { kind: 'error', text: 'Add the name to show next to your pledge, up to 60 characters.' },
  idea_gone: { kind: 'error', text: 'That idea is no longer listed.' },
  pledge_listed: { kind: 'ok', text: 'Your pledge is listed. We will email you when the pool opens.' },
  pledge_held: { kind: 'ok', text: 'Thank you. Your pledge is saved. Because it is from a company, is a larger amount, names an X account, or shows a name other than your username, a person checks it before it is listed. We will email you when the pool opens.' },
  bad_title: { kind: 'error', text: 'Give the idea a name between 3 and 80 characters, with some letters or numbers.' },
  bad_pitch: { kind: 'error', text: 'Keep the description under 280 characters.' },
  bad_writeup: { kind: 'error', text: 'Keep each part of the write-up under 1,200 characters, and the search phrase under 120.' },
  bad_missing: { kind: 'error', text: 'Keep "what is missing" under 600 characters.' },
  need_missing: { kind: 'error', text: 'Similar projects already exist. Say what they are missing, in a sentence or two.' },
  too_many_ideas: { kind: 'error', text: 'You have posted the most ideas one person can.' },
  idea_exists: { kind: 'ok', text: 'Someone already posted this one. Give it a heart here.' },
  idea_posted: { kind: 'ok', text: 'Your idea is up.' },
  bad_sponsor: { kind: 'error', text: 'Check the sponsor: a name, an amount of at least $1, and https addresses for the link and logo.' },
  need_email: { kind: 'error', text: 'Add an email address we can reach you at when the pool opens. It is never shown on the site.' },
  bad_email: { kind: 'error', text: 'That email address does not look right.' },
  bad_note: { kind: 'error', text: 'Keep the note under 500 characters.' },
  too_many: { kind: 'error', text: 'Too many submissions from this connection in the last hour. Try again later.' },
  subscribed: { kind: 'ok', text: 'You are on the list. You will hear from us only about this hackathon. If this address unsubscribed before, it stays off: use the link in any earlier email to rejoin.' },
  need_why: { kind: 'error', text: 'Say why you would be a good fit for the panel, in a sentence or two.' },
  need_note: { kind: 'error', text: 'Say what you can help with, in a sentence or two.' },
  panel_saved: { kind: 'ok', text: 'Your application is in. The organizer reads every one.' },
  organize_saved: { kind: 'ok', text: 'Thank you. The organizer will be in touch by email.' },
  bad_inquiry: { kind: 'error', text: 'Check the form: a company, your name, an optional whole-dollar amount, and a message under 1,000 characters.' },
  inquiry_saved: { kind: 'ok', text: 'Thank you. A person will reply to the address you gave.' },
  done: { kind: 'ok', text: 'Done.' },
} as const;

export type MessageCode = keyof typeof MESSAGES;

/** Send the visitor back to one of our own pages with a message code. A `#section` stays at the end, after the code. */
export function back(path: string, code: MessageCode): Response {
  const [before, hash] = path.split('#', 2);
  const sep = before.includes('?') ? '&' : '?';
  return new Response(null, { status: 303, headers: { location: `${before}${sep}m=${code}${hash ? `#${hash}` : ''}` } });
}

/** Only our own paths: one leading slash, then letters, digits, dashes and slashes. Never `//host`. */
export function safeNext(v: string | null, fallback = '/join'): string {
  return v && /^\/(?!\/)[\w\-/]*$/.test(v) ? v : fallback;
}
