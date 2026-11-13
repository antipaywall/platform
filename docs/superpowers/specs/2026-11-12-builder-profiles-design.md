# Builder profiles and accounts: design

Approved by Ethan on 2026-11-12, from the review page of mockups (builders tiles, home section,
profile page, signed-in menu, account page).

## Why
Antipaywall should feel like a place people have a presence, not a form they filled in once. Builders
get a public page that shows who they are and what they build, the home page shows the people who
have joined, and a signed-in person has a real account area instead of a name and a sign-out button.

## Goals
- `/builders` as small tiles (option B): square-ish picture (light radius), username, and icons for
  GitHub or GitLab, X and website. A missing X or website icon is greyed out and not a link. The
  picture and name open the builder's profile on Antipaywall.
- A profile page per builder at `/builders/<username>` (GitLab: `/builders/gitlab/<username>`):
  provider details (name, bio, location, picture, joined dates, "passed both checks"), up to 6
  featured public repos, and what the builder adds: About (400 chars), up to 8 skills, an "open to a
  team" note, their ideas, and a place for their entry later.
- A builders section on the home page, under the dates strip: count, progress to 100, newest 12
  builders as tiles, "Your spot" tiles to fill the row, Join and See all buttons.
- A signed-in menu in the header (picture and name open it) and an `/account` page: edit profile,
  pick featured repos, see pledge, ideas and email status, sign out, delete the account.
- Footer at the bottom of short pages, site-wide.

## Non-goals
Entries, voting, teams, follower counts, messaging, editing the picture or name (they always come from
the provider).

## Anti-goals
- Never show anyone's email. Never read private repositories.
- Never make a non-builder public without their say-so.
- Never let a profile page depend on a live call to GitHub or GitLab to render.

## Decisions
- Builders are always public (they already are on `/builders`). Anyone else has a "make my profile
  public" switch, off by default. Terms and privacy say so.
- Repositories are saved on the person's row: refreshed at sign-in, and when a profile is viewed and
  the saved copy is over a day old (with a short timeout, falling back to the saved copy). No cron.
  GitHub uses `GITHUB_TOKEN` when set (5,000 requests an hour) and works without it (60 an hour).
- Featured repos: the builder's picks (up to 6), else their top 6 by stars. Forks and archived repos
  are left out.
- Delete account deletes the sign-in user; the database cascades to the person, ideas, pledges, panel
  and organize entries and events. A tickbox (on by default) also takes their address off the list.

## Approaches considered (repos)
1. Saved copy on the person's row, refreshed at sign-in and when stale. Picked: instant pages, no
   rate-limit risk, no scheduled job or extra secret.
2. Live fetch on every profile view: slow, and 60 requests an hour without a token.
3. Fetch in the visitor's browser: same limits, empty boxes while loading, CSP changes.

## Left to the builder
Exact styling within the site's existing tokens, the empty states, and the GitLab project fields
(GitLab's API gives no language per project, so it is left blank).
