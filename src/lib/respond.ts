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
  bad_about: { kind: 'error', text: 'Keep "About" under 400 characters.' },
  bad_skills: { kind: 'error', text: 'Add up to 8 skills, separated by commas, each under 30 characters.' },
  bad_team_note: { kind: 'error', text: 'Keep the team note under 140 characters.' },
  too_many_repos: { kind: 'error', text: 'Pick up to 6 repositories.' },
  profile_saved: { kind: 'ok', text: 'Profile saved.' },
  repos_saved: { kind: 'ok', text: 'Featured repositories saved.' },
  need_delete_confirm: { kind: 'error', text: 'Tick the box to confirm you want your account deleted.' },
  organizer_cannot_delete: { kind: 'error', text: "The organizer's account can't be deleted from here." },
  account_deleted: { kind: 'ok', text: 'Your account and everything tied to it is deleted.' },
  need_post: { kind: 'error', text: 'Write something first.' },
  bad_post: { kind: 'error', text: 'Keep it under 500 characters.' },
  need_kind: { kind: 'error', text: 'Pick what kind of post this is: an update, looking for a team, a question, or something you shipped.' },
  need_checks: { kind: 'error', text: 'Posting is open to anyone who passes the two builder checks.' },
  posting_off: { kind: 'error', text: 'Your posting has been turned off by the organizer.' },
  too_many_posts: { kind: 'error', text: 'That is the most posts one person can make in a day. Try again tomorrow.' },
  too_many_replies: { kind: 'error', text: 'That is the most replies one person can make in a day. Try again tomorrow.' },
  post_gone: { kind: 'error', text: 'That post is no longer there.' },
  posted: { kind: 'ok', text: 'Posted.' },
  replied: { kind: 'ok', text: 'Replied.' },
  reported: { kind: 'ok', text: 'Thanks. The organizer will look at it.' },
  post_deleted: { kind: 'ok', text: 'Post deleted.' },
  no_such_person: { kind: 'error', text: 'Nobody with that username has signed in.' },
  done: { kind: 'ok', text: 'Done.' },
  not_a_suggestion: { kind: 'error', text: "That isn't an open suggestion for this idea." },
  need_username: { kind: 'error', text: 'Choose your username first.' },
  offered: { kind: 'ok', text: 'It now shows as looking for a new owner, with your terms.' },
  already_offered: { kind: 'error', text: 'This is already looking for a new owner.' },
  not_yours_to_offer: { kind: 'error', text: 'Only the person who started this can hand it off.' },
  interest_sent: { kind: 'ok', text: "They'll see you'd take it over." },
  handed_off: { kind: 'ok', text: 'Handed off. Thank you for passing it on.' },
  app_not_connected: { kind: 'error', text: "Suggesting changes needs the Antipaywall GitHub App, which isn't connected here yet." },
  need_summary: { kind: 'error', text: 'Say what you changed, in a line.' },
  bad_idea_file: { kind: 'error', text: 'Keep the part between the dashes as it was (the title and status can change; who started it cannot).' },
  no_change: { kind: 'error', text: "That's the same as the idea now. Change something first." },
  suggestion_sent: { kind: 'ok', text: 'Your suggestion is sent. The person who started the idea decides.' },
  suggestion_accepted: { kind: 'ok', text: 'Accepted. The idea is updated, and the suggester is credited.' },
  suggestion_declined: { kind: 'ok', text: 'Declined, with a thank-you to the suggester.' },
  not_yours_to_decide: { kind: 'error', text: 'Only the person who started this idea can decide on suggestions.' },
  merge_failed: { kind: 'error', text: "GitHub couldn't merge it, usually because another change came first. The suggester can update it." },
  entry_started: { kind: 'ok', text: "You're a Season 1 builder. Your entry is saved." },
  entry_removed: { kind: 'ok', text: 'Your entry is removed. You still show as interested in Season 1.' },
  entry_join_first: { kind: 'error', text: 'Join as a builder first, then start your entry.' },
  entry_needs_github: { kind: 'error', text: 'Entries are public GitHub repos. Connect your GitHub account first.' },
  entry_bad_repo: { kind: 'error', text: 'Give the repo as owner/name, or its github.com address.' },
  entry_private: { kind: 'error', text: 'That repo is private. Entries must be public.' },
  entry_not_yours: { kind: 'error', text: "That repo isn't owned by your GitHub account." },
  entry_not_found: { kind: 'error', text: "We couldn't find that repo on GitHub." },
  entry_taken: { kind: 'error', text: "Someone else already entered that repo. If you're building it together, each start your own entry or ask them." },
  username_taken: { kind: 'error', text: 'That username is taken here. Pick another.' },
  username_on_github: { kind: 'error', text: "That's someone's username on GitHub, so it's kept for them. Pick another." },
  bad_username: { kind: 'error', text: 'Use letters, numbers and single dashes, up to 39 characters.' },
  username_saved: { kind: 'ok', text: 'Your username is set.' },
  link_failed: { kind: 'error', text: "Connecting GitHub didn't finish. Try again, or pick a username instead." },
  bad_pay: { kind: 'error', text: 'Pick one of the amounts. It is only a signal: nobody is charged.' },
  signal_saved: { kind: 'ok', text: 'Thanks. Builders can see where people stand.' },
  signin_for_follow: { kind: 'error', text: 'Following needs a GitHub or GitLab sign-in for now. Your signals still count without one.' },
  claimed: { kind: 'ok', text: "You're on it. Others building it can find you here." },
  unclaimed: { kind: 'ok', text: "You're no longer listed as building this." },
  merged: { kind: 'ok', text: 'Joined. Your support counts on this one now.' },
  unmerged: { kind: 'ok', text: 'Split back out. They will not be joined again.' },
  bad_repo_url: { kind: 'error', text: 'The repo address must start with https://github.com/ or https://gitlab.com/.' },
  bad_claim_note: { kind: 'error', text: 'Keep the note under 140 characters.' },
  need_builder_signin: { kind: 'error', text: 'Claiming is for builders. Sign in with GitHub or GitLab first.' },
} as const;

export type MessageCode = keyof typeof MESSAGES;

/** Send the visitor back to one of our own pages with a message code. A `#section` stays at the end, after the code. */
export function back(path: string, code: MessageCode): Response {
  const [before, hash] = path.split('#', 2);
  const sep = before.includes('?') ? '&' : '?';
  return new Response(null, { status: 303, headers: { location: `${before}${sep}m=${code}${hash ? `#${hash}` : ''}` } });
}

/**
 * Where to send someone back to after a post, a brick or a follow: one of our own pages, with
 * an optional plain query and #section. Never `//host`, never a scheme. Any old message is dropped.
 */
export function safeBack(v: unknown, fallback = '/feed'): string {
  if (typeof v !== 'string' || v.length > 300 || !/^\/(?!\/)[\w\-/.%]*(\?[\w=&\-%.]*)?(#[\w-]+)?$/.test(v)) return fallback;
  const [pathQuery, hash] = v.split('#', 2);
  const [path, query = ''] = pathQuery.split('?', 2);
  const kept = query.split('&').filter((kv) => kv && !kv.startsWith('m=')).join('&');
  return `${path}${kept ? `?${kept}` : ''}${hash ? `#${hash}` : ''}`;
}

/** Only our own paths: one leading slash, then letters, digits, dashes and slashes. Never `//host`. */
export function safeNext(v: string | null, fallback = '/hackathon/join'): string {
  return v && /^\/(?!\/)[\w\-/]*$/.test(v) ? v : fallback;
}
