# Antipaywall platform release: design

Date: 2026-11-13. Builds on `2026-11-12-antipaywall-platform-design.md` (the directory, signals, matching,
sync, catalog), which stays in force except where this document changes it. Branch: `feat/platform`.
One release, tested on the `feat/platform` Vercel preview. Nothing ships in pieces.

## What changed and why

Ethan decided the full shape of the release (relayed 2026-11-13):

- The home page is the platform; the hackathon becomes a section under `/hackathon` with its own second menu.
- Everyone is a builder, at `/builders/<username>`, one namespace. Sign-in is GitHub or GitLab only; email sign-in is removed.
- Ideas (gaps) live as Markdown files in a public GitHub repo. Improvements are pull requests, opened by an
  Antipaywall GitHub App on the builder's behalf; accepting merges them. "Keep the platform truly open source."
- Season 1 builders are the people who have started an entry repo; everyone who joined so far is "Interested in Season 1".
- Adopt a project: "Looking for a new owner", with the original builder's terms.
- The Antipaywall MCP: search and look up for agents, plus posting, "me too" and suggesting improvements; GitHub sign-in, builders only.
- No governance, no course, and never any donation wording.
- Same rules: same database, additive migrations, each applied on Ethan's yes; previews share live data; plain language; the brand holds.

Facts that shaped it (production, 2026-11-13): 17 GitHub accounts, 0 GitLab, 13 joined as builders, 10 ideas (7 posted by the platform), 0 email backers.

## Order of work

PR #7 (`feat/social`) merges into `feat/platform` first, on Ethan's go-ahead (not before). Everything below
builds on it. PR #6 is already inside this branch; it is closed as superseded when this PR opens.

## 1. The hackathon section

- Every hackathon page moves under `/hackathon`:

  | Old | New |
  |---|---|
  | `/hackathon` (today's season page) | `/hackathon` |
  | `/rules` | `/hackathon/rules` |
  | `/about` | `/hackathon/about` |
  | `/faq` | `/hackathon/faq` |
  | `/join`, `/join/build`, `/join/panel`, `/join/organize` | `/hackathon/join`, `/hackathon/join/build`, `/hackathon/join/panel`, `/hackathon/join/organize` |
  | `/pool` | `/hackathon/pool` |
  | `/fund` | `/hackathon/fund` |
  | `/sponsor` | `/hackathon/sponsor` |
  | (new) | `/hackathon/builders`: Season 1 builders, then everyone interested |

- Every old address answers with a permanent redirect (301) to its new one, via `astro.config` `redirects`,
  so shared links keep working. The forms' API routes (`/api/join`, `/api/pledge`…) keep their addresses.
- Inside `/hackathon/*`, a second, smaller menu sits under the main one: Season 1 · Rules · Pool · Fund · Sponsor · Builders · Questions · Join.
- Main menu: **Find · Wanted · Builders · Hackathon**. Footer gains the hackathon links under one heading.
- #7's crew section and `GoalMeter` move from the old home to the season page; the home banner keeps a compact goal bar.
- The plan doesn't change: 100 builders, dates announced once 100 have joined and the pool holder is confirmed, same rules and prizes.
  **The 100 counts people who joined (interested), as today.** Entries are shown next to it, not instead of it.
- Season briefs: `seasons.brief_count` (default 5). While a season collects, its briefs are the top `brief_count`
  gaps by demand; they freeze into `season_briefs` when it opens. Later seasons set their own count.

## 2. Builders and usernames

- Everyone signed in is a builder. Profiles are public at `/builders/<username>`; the existing "hide my profile" choice stays.
- `/builders` lists builders (most active first), with a link to Season 1's list. `/builders/gitlab/<handle>` and
  `/people/<id>` redirect to `/builders/<username>`.
- New column `people.username` (unique, case-insensitive, GitHub's rules: letters, digits, single dashes, 1–39 characters).
- **GitHub sign-in:** the username is the GitHub login. A GitHub owner always gets their own name. If a GitLab
  builder holds it (possible only if the GitHub account was created after they took it), the GitLab builder is
  renamed to a free name, told on next sign-in, and their old address redirects.
- **GitLab sign-in:** the username is the GitLab handle unless it collides: taken here, or `https://api.github.com/users/<name>`
  answers 200 (someone owns it on GitHub). On a collision the builder chooses, on one screen:
  1. **Connect GitHub** to prove the GitHub account with that name is theirs (Supabase identity linking). The
     verified login is stored in `people.github_login`; the username becomes it.
  2. **Pick a username**, checked against this site and GitHub as they type.
  If GitHub doesn't answer, the name isn't given out yet; the screen asks to try again.
- Every rename writes `username_redirects (old, person_id)`, so old links keep working.
- Backfill: every current account (all GitHub) gets `username = handle`.

## 3. Season 1 builders

- New table `season_entries (season_id, person_id, repo_full_name, repo_github_id, started_at)`.
- "Start your entry" on `/hackathon` and on the builder's own profile: pick one of your public repos (the list the
  profile already keeps) or paste the address of a new one. It must be public and owned by you. You can change it up to
  the final cutoff (set when dates are announced).
- Badges (#7's `badges.ts`): **Season 1 builder** when they have an entry; **Interested in Season 1** when they joined
  (`is_builder`) without one. Nobody re-opts in. The old `season` badge from `is_builder` becomes the "interested" badge.

## 4. Ideas live on GitHub

**Where:** a new public repo, **`antipaywall/ideas`** (recommended over a folder in the platform repo):
idea PRs don't mix with code PRs and CI, the App's write access is limited to ideas, and the ideas can carry their
own license (**CC BY 4.0**, credit to contributors) separate from the code's MIT.

**One file per idea:** `ideas/<slug>.md`

```markdown
---
title: All-in-one reviews widget for static sites
status: wanted            # wanted | building | exists | adopt
started_by: ethanplusai   # GitHub login; absent for ideas Antipaywall posted
replaces: [birdeye, elfsight]   # paid product slugs
like:                     # "like this one" links
  - https://www.elfsight.com/google-reviews-widget/
merged_into: null         # slug, when this idea was folded into another
created: 2026-11-13
---

## The problem
…
## What it should do
…
## What existing options are missing
…
## Open questions
…
```

**How it flows**

- **Post an idea** on the site (or through the MCP): the duplicate check runs first, as today. Then the App commits
  the file to `main`, with the builder as the commit's **author** (their GitHub no-reply address), so GitHub credits
  them. The database row is written at the same moment so the page exists immediately.
- **Suggest an improvement:** an editor on the gap page, prefilled with the file's text. Saving makes the App open a
  pull request from a branch, authored by the builder, with "Suggested by @login on Antipaywall" in its description.
- **Accept / Decline:** the person who started the idea sees open suggestions on the gap page with a plain diff.
  Accept merges the PR (the App); Decline closes it with a kind note. Ideas Antipaywall posted are decided by the
  ideas repo's maintainers (Ethan for now, through `CODEOWNERS`).
- **Edit directly:** the idea's starter can edit their own idea; the App commits it, authored by them.
- **Developers** can also fork and open PRs on GitHub. Maintainers merge them there.
- **Who shaped it:** the gap page lists everyone with a commit to the file (from the file's commit history), newest first,
  with each change's one-line message.
- **The database is a cache.** `ideas` rows stay (hearts, signals, claims and merges point at them) and gain `repo_path`,
  `repo_sha`, `synced_from_repo_at`. A webhook from the App on every push to `main` updates the changed rows; the daily
  sync re-reads the whole repo as a backstop. Open suggestions are cached in `idea_suggestions` from `pull_request` events.
- **Merges** of duplicates set `merged_into` in the file (a commit), and still show on the site as today.
- **Moderation:** hiding an idea removes its file (an App commit by the organizer) and marks the row hidden.
- **Migration:** a one-off script writes the 10 existing ideas as files (first commit by the App, authored by each
  poster where there is one).

**What Supabase keeps:** auth, accounts and usernames, signals and hearts, follows, posts and bricks, claims, entries,
adoption offers, MCP keys, emails and analytics. Everything else is the catalog repo, the ideas repo, or public GitHub data.

## 5. The GitHub App (Ethan creates it; nothing is created for him)

Ethan creates it at github.com → antipaywall organization → Settings → Developer settings → GitHub Apps → New:

| Setting | Value |
|---|---|
| Name | Antipaywall |
| Homepage URL | https://www.antipaywall.org |
| Webhook URL | https://www.antipaywall.org/api/github/webhook |
| Webhook secret | a long random string he generates and keeps |
| Repository permissions | Contents: Read and write · Pull requests: Read and write · Metadata: Read-only |
| Subscribe to events | Push · Pull request |
| Where can it be installed | Only on this account |
| Install | on `antipaywall/ideas` only |

Then he adds these as Vercel environment variables (Production and Preview) and as GitHub Actions secrets on
`antipaywall/platform`: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` (the .pem contents), `GITHUB_APP_INSTALLATION_ID`,
`GITHUB_WEBHOOK_SECRET`. The App's installation token also gives the daily sync a proper rate limit.
Webhooks go to production only; a preview reads the repo directly and refreshes its cache on page view.

## 6. Adopt a project

- A builder can mark **a project they own** (their GitHub login is the repo owner) or **a gap they started or built**
  as **Looking for a new owner**.
- They pick terms from a fixed list, plus a note: keep it open source · credit me · I'll advise · ask me first.
  Anything about money happens between the two people, off the site, and the page says so.
- Builders press **I'd take it over** (with a note); the offerer sees them and marks one as the new owner, or withdraws.
- Antipaywall shows the terms and never enforces them or handles money.
- Tables: `adoptions (id, subject_kind project|gap, subject_id, offered_by, terms text[], note, status open|taken|withdrawn, taken_by)`,
  `adoption_interest (adoption_id, person_id, note)`. A gap's status shows "Looking for a new owner"; a filter on
  `/ideas` and a list on the home page show them.

## 7. The Antipaywall MCP

- An MCP server at `/mcp` (Streamable HTTP, stateless) on the same site. No AI model is called on our side.
- **Sign-in:** a builder signed in with GitHub creates an **MCP key** on their account page (shown once, stored hashed,
  revocable, last-used shown). Agents send it as a bearer token. Builders only (a `people` row); no key, no access.
  GitHub's device-code sign-in is the next step if keys feel heavy.
- **Tools:** `search` (paid products, gaps, projects, topics), `get_gap`, `top_gaps`, `alternatives_to` (a paid product's
  projects), `post_idea` (runs the duplicate check first and only posts when told the matches don't fit), `me_too`,
  `suggest_improvement` (opens the PR through the App), `follow`.
- **Limits:** the same checks as the site (ideas per person, rate limits per key), and every write is recorded like a site action.
- A short page, `/mcp` in a browser, explains how to add it to Claude Code, Claude Desktop, Cursor and others.

## 8. Run it yourself

`docs/run-locally.md` and `pnpm local:seed`: clone the platform and the ideas repo, `supabase start`, apply the
migrations, then `pnpm local:seed` pulls the open data (`/open-data/*.json`) and the ideas repo into the local
database. The sync and the matcher run against it as they do in production. Nothing private is needed.

## 9. Removed

- Email sign-in: the routes, the backer page, the account menu for backers, the copy. The `backers` table and
  `ideas.backer_id` stay in the database (additive-only rule) and are no longer used.
- Any donation wording: "donate", "donation", "donor" are replaced (the pool takes pledges and contributions) and a
  test keeps them out.

## Migration 0019 (additive)

`people.username` (+ unique lower index, backfilled), `people.github_login`, `username_redirects`, `season_entries`,
`seasons.brief_count`, `ideas.repo_path/repo_sha/synced_from_repo_at`, `idea_suggestions`, `adoptions`,
`adoption_interest`, `mcp_keys`. RLS on, no policies, service role only, like every table.

## Calls I made (for Ethan to check)

1. Ideas in a separate repo, `antipaywall/ideas`, licensed CC BY 4.0.
2. The App commits with the builder as the author, so GitHub itself credits them.
3. The 100-builder start counts people who joined, as today; entries show alongside.
4. `/builders` stays the platform's directory of everyone; Season 1's list is `/hackathon/builders`.
5. All profiles are public by default (they're built from public GitHub data); hiding stays possible.
6. MCP sign-in is a per-builder key from the account page for now.
7. Adopting a project: the repo owner's login must match the signed-in builder (organization-owned repos later).

## What Ethan has to do

- Approve this plan.
- Say go on merging PR #7 into `feat/platform`.
- Create the public repo `antipaywall/ideas` (or tell me to create it with `gh`).
- Create the GitHub App exactly as in section 5, install it on the ideas repo, and add the four variables in Vercel and GitHub Actions.
- Say yes to migration 0019 when asked.
