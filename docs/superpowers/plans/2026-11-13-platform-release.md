# Antipaywall Platform Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the whole platform as one release: the hackathon under `/hackathon`, one builder namespace, ideas backed by a GitHub repo through an Antipaywall GitHub App, Season 1 entries, adopt a project, and the Antipaywall MCP.

**Architecture:** Astro SSR on Vercel with Supabase, as now. Ideas become Markdown files in `antipaywall/ideas`, written and proposed through a GitHub App (installation tokens, signed with the App key); Supabase caches them, updated by the App's webhook and the daily sync. The MCP is a stateless Streamable-HTTP endpoint on the same site, authenticated by per-builder keys.

**Tech Stack:** Astro 7, Supabase, Vitest, pnpm, `@modelcontextprotocol/sdk` (new), Node `crypto` for the App's JWT (no new dependency), `yaml`.

**Spec:** `docs/superpowers/specs/2026-11-13-platform-release-design.md` (and the earlier `2026-11-12-antipaywall-platform-design.md`).

## Global Constraints

- Everything from the earlier plan's Global Constraints holds (additive migrations from `0019`, each applied on Ethan's yes; no server-side AI; signals never money; plain language; no "draft"; brand system; test emails to e@ethanplus.ai; commit only to `feat/platform`; never merge).
- PR #7 is merged into `feat/platform` only after Ethan says go.
- No credential is created by the builder: the GitHub App, its key and the ideas repo are Ethan's to create (the repo may be created with `gh` only if he says so).
- No copy says donate, donation or donor.
- Webhooks are verified (HMAC SHA-256 against `GITHUB_WEBHOOK_SECRET`) before anything is read from them.

## Review Focus

1. **A GitLab sign-in whose handle exists on GitHub** → never given that username; chooses or connects GitHub. Test in Task 4.
2. **Two people suggest improvements to the same idea at once** → two separate PRs on separate branches; accepting one leaves the other open (it may then conflict; GitHub reports it, the gap page says "needs updating"). Test in Task 7.
3. **A webhook with a bad signature or for another repo** → 401/ignored, nothing written. Test in Task 6.
4. **An MCP call with a revoked key or a non-builder** → 401, nothing done. Test in Task 9.
5. **An old link** (`/rules`, `/join/build`, `/builders/gitlab/x`, `/people/<id>`) → one 301 to the right page. Test in Task 3.

---

### Task 1: Merge PR #7 into feat/platform and fill its person slots
- [ ] Wait for Ethan's go. `git fetch origin && git merge --no-ff origin/feat/social`; resolve conflicts (index.astro: keep the platform home; move #7's crew + `GoalMeter` into `src/pages/hackathon/index.astro`; builders profile: keep #7's layout).
- [ ] `src/components/person/PersonStats.astro` and `PersonWants.astro` render `pf/PersonStats` / `pf/PersonWants` with `personId`. OR `isBacker` into the backer badge at #7's marked comment.
- [ ] `pnpm test && pnpm check && pnpm build` → pass. Commit `chore: merge the social layer into the platform`.

### Task 2: Remove email sign-in and donation wording
**Files:** delete `src/pages/auth/email.astro`, `src/pages/api/auth/email.ts`, `src/lib/emailSignIn.ts`, `src/pages/people/[id].astro` (becomes a redirect in Task 4), `src/pages/api/account/backer.ts`, `tests/backers.test.ts`; remove backer branches from `middleware.ts`, `SiteHeader.astro`, `SignIn.astro` (`email` prop), `auth/callback.ts`, `api/ideas.ts`, `ideas/new.astro`; drop `signInEmail` from `email.ts`.
- [ ] Test first in `tests/pages.test.ts`: `it('never talks about donating')` → no served file matches `/\bdonat|\bdonor/i`. Run → FAIL (fund.astro).
- [ ] Rewrite the fund copy (contributions to the pool, pledges); remove the email sign-in code. Run suite → PASS. Commit.

### Task 3: The hackathon section under /hackathon
**Files:** move `src/pages/hackathon.astro` → `src/pages/hackathon/index.astro`; `rules, about, faq, pool, fund, sponsor` → `src/pages/hackathon/*.astro`; `join/*` → `src/pages/hackathon/join/*`; create `src/pages/hackathon/builders.astro`, `src/components/HackathonNav.astro`, `src/layouts/Hackathon.astro` (Base + second menu); modify `astro.config.mjs` (`redirects`), `SiteHeader.astro` (Find · Wanted · Builders · Hackathon), `SiteFooter.astro`, every internal link (`grep -rn "href=\"/(rules|about|faq|pool|fund|sponsor|join)"`), `sitemap` static list, `safeNext` default (`/hackathon/join`).
**Interfaces:** `HACKATHON_REDIRECTS: Record<string, string>` in `src/config/routes.ts`, used by `astro.config.mjs` and the test.
- [ ] Test `tests/routes.test.ts`: every key of `HACKATHON_REDIRECTS` maps to an existing page file under `src/pages/hackathon`; no `.astro` file links to an old address. → FAIL, implement, PASS.
- [ ] Seasons: migration adds `seasons.brief_count int not null default 5`; `getSeason` uses it (test: `pickBriefs` honors a count of 3).
- [ ] Builders list: Season 1 builders (entries, Task 5) first, then everyone interested.
- [ ] Commit `feat: the hackathon becomes its own section, and old addresses redirect`.

### Task 4: One namespace and usernames
**Files:** `supabase/migrations/0019_release.sql` (all of the spec's 0019 list, written here once); `src/lib/usernames.ts`; `src/pages/auth/username.astro` (choose / connect screen); `src/pages/api/account/username.ts`; `src/pages/auth/callback.ts`; `src/lib/profiles.ts` (`profilePath(username)` → `/builders/<username>`); `src/pages/builders/[...slug].astro` (one segment; `gitlab/<h>` and old names redirect via `username_redirects`); `src/pages/people/[id].astro` → 301 to the profile.
**Interfaces:**
- `validUsername(s: string): boolean` — GitHub rules, 1–39 chars, no leading/trailing or double dashes.
- `githubHasUser(name: string, f?: typeof fetch): Promise<'yes' | 'no' | 'unknown'>` — `GET https://api.github.com/users/<name>` 200/404/else.
- `assignUsername(db, person: { id; provider; handle; githubLogin? }, f?): Promise<{ username: string } | { choose: true; wanted: string; reason: 'taken' | 'on_github' | 'github_unreachable' }>`.
- [ ] Tests: `validUsername` cases; **Review Focus 1:** `assignUsername` for a GitLab handle with `githubHasUser` → 'yes' returns `{ choose: true, reason: 'on_github' }`; with 'unknown' → `github_unreachable`; a GitHub login held by a GitLab builder → the GitHub builder gets it and the other is renamed (fake db records the redirect). **Review Focus 5:** `/builders/gitlab/x` and `/people/<id>` resolve to one 301.
- [ ] Ask Ethan: "Apply 0019 (new tables and columns only) to production?" → apply on yes; backfill `username = handle` in the same migration.
- [ ] Connect GitHub: `supabase.auth.linkIdentity({ provider: 'github' })` from the choose screen; on return read the linked identity's login into `github_login`, then username. (Needs "Manual linking" enabled in Supabase Auth settings: Ethan's toggle, listed in the PR.)
- [ ] Commit `feat: one builder namespace with GitHub-first usernames`.

### Task 5: Season 1 entries and badges
**Files:** `src/lib/entries.ts`, `src/pages/api/hackathon/entry.ts`, the entry box on `/hackathon` and the own-profile view; `src/lib/badges.ts` (from #7).
**Interfaces:** `parseEntryRepo(input: string): { owner; name } | null`; `checkEntryRepo(owner, name, login, f?): Promise<{ ok: true; githubId: number } | { ok: false; reason: 'not_found' | 'private' | 'not_yours' }>`; badges `season1` (entry) and `season1_interested` (`is_builder`, no entry).
- [ ] Tests for both functions and the badge choice. FAIL → implement → PASS. Commit `feat: Season 1 builders are the people who started an entry`.

### Task 6: The GitHub App client, the ideas repo format, the webhook and the cache
**Files:** `src/lib/githubApp.ts`, `src/lib/ideaFile.ts`, `src/pages/api/github/webhook.ts`, `scripts/ideas-export.ts`, `scripts/sync.ts` (re-read the ideas repo), `catalog/README.md` (link to the ideas repo).
**Interfaces:**
- `appJwt(appId: string, pem: string, now: Date): string` (RS256 with `node:crypto`, 9-minute expiry).
- `installationToken(): Promise<string>` (cached until 5 minutes before expiry).
- `parseIdeaFile(text: string, path: string): IdeaFile` / `renderIdeaFile(idea: IdeaFile): string` — front matter `title, status, started_by, replaces, like, merged_into, created`, body sections; round-trips.
- `verifyWebhook(body: string, signature: string | null, secret: string): boolean` (timing-safe).
- `commitIdeaFile(path, text, message, author: { name; email }, sha?)`, `openSuggestion(path, text, title, author, by: string): Promise<{ number; url }>`, `mergeSuggestion(number)`, `closeSuggestion(number, note)`, `fileHistory(path): Promise<{ login; message; date }[]>`.
- [ ] Tests: JWT header/claims decode (fixed test key); `parseIdeaFile(renderIdeaFile(x))` equals `x`; **Review Focus 3:** `verifyWebhook` false for a wrong signature, true for the right one; the webhook route ignores pushes to other repos or branches.
- [ ] `scripts/ideas-export.ts` writes the 10 current ideas as files (dry-run by default; `--commit` uses the App). Run for real only after Ethan creates the repo and App, and says go.
- [ ] Commit `feat: ideas live in the antipaywall/ideas repo, through the Antipaywall GitHub App`.

### Task 7: Posting, suggesting, accepting and history on gap pages
**Files:** `src/lib/postIdea.ts` (writes the file through the App, then the row), `src/pages/ideas/[slug].astro` (suggestions, history, editor), `src/pages/ideas/[slug]/suggest.astro`, `src/pages/api/ideas/suggest.ts`, `src/pages/api/ideas/decide.ts`, `src/lib/suggestions.ts`.
**Interfaces:** `canDecide(idea: { startedBy: string | null }, login: string, maintainers: string[]): boolean`; `suggestionBranch(slug: string, login: string, now: Date): string` (unique per suggestion).
- [ ] Tests: `canDecide` cases; **Review Focus 2:** two `suggestionBranch` calls for the same idea differ; the decide route refuses someone who isn't the starter or a maintainer.
- [ ] Without the App configured (local dev, a preview before Ethan sets it up) posting still works and writes only the database, with a note in the admin view; suggestions say "coming soon" is NOT allowed copy → they say "Suggesting changes needs the Antipaywall GitHub App, which isn't connected here."
- [ ] Commit `feat: suggest improvements to ideas as pull requests, and accept them`.

### Task 8: Adopt a project
**Files:** `src/lib/adoptions.ts`, `src/pages/api/adoptions/*.ts`, `src/components/pf/AdoptBox.astro` on project and gap pages, filter on `/ideas`, a home-page list.
**Interfaces:** `ADOPTION_TERMS = ['open_source', 'credit', 'advise', 'ask_first'] as const` with plain labels; `canOffer(subject, login, personId)`.
- [ ] Tests: `canOffer` (repo owner match; gap starter or claimer); terms parsing rejects unknown terms. Commit `feat: hand off what you started`.

### Task 9: The Antipaywall MCP
**Files:** `src/pages/mcp.ts` (POST: MCP; GET: the how-to page), `src/lib/mcp/tools.ts`, `src/lib/mcp/keys.ts`, `src/pages/api/account/mcp-keys.ts`, the keys section on `/account`.
**Interfaces:** `newKey(): { plain: string; hash: string }` (`apw_` + 32 random bytes base64url; sha-256 hash stored); `personForKey(db, bearer: string | null): Promise<Person | null>`; tools as in the spec, each calling the same lib functions the pages use.
- [ ] Tests: **Review Focus 4:** `personForKey` null for an unknown or revoked key and for a key whose person row is gone; a tool call without a person → 401; `post_idea` without `confirm_new` returns matches and posts nothing.
- [ ] Add `@modelcontextprotocol/sdk` (exact version, at least two weeks old). Commit `feat: the Antipaywall MCP for coding agents`.

### Task 10: Run it yourself
**Files:** `docs/run-locally.md`, `scripts/local-seed.ts`, `package.json` (`local:seed`), `.env.example`.
- [ ] `pnpm local:seed --base https://www.antipaywall.org` against a local Supabase fills products, topics, projects and gaps; document every step; try it once against `supabase start` if Docker is available (state the disk estimate first), else say it wasn't run.
- [ ] Commit `docs: run Antipaywall yourself from the open data`.

### Task 11: Verify on the preview, open the PR
- [ ] Full suite, check, build. Push. On the preview: every redirect, the hackathon section and its second menu, a GitHub sign-in's username, Season 1 entry, an idea posted and a suggestion opened and accepted (if the App exists; otherwise the fallback), adopt, the MCP from Claude Code with a test key, phone width.
- [ ] Fresh whole-branch review; fix Critical/Important.
- [ ] `gh pr create --base main`; close PR #6 as superseded with a comment; "Waiting on your merge" list.
