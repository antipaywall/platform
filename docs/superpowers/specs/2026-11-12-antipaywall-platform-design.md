# Antipaywall platform: design

Date: 2026-11-12. Branch: `feat/platform` (from `feat/builder-profiles`, PR #6; the social layer, PR #7, merges into it).
Target feel: the clickable mockup (Home, Tool, Idea, Person, Season). All mockup data is sample data.

## Intent

Antipaywall finds the free, open-source version of anything people pay for, shows what is still
missing and how badly people want it, and turns the biggest gaps into hackathon briefs.

The hackathon alone has to be marketed from scratch every season. A directory people find
through search grows on its own and creates demand for the next season. The deeper goal is open
source itself: one strong shared version instead of a hundred solo ones.

The platform is meant to outlive its founder. Everything that decides what the site shows
(the catalog, the matching rules, the sync) lives in the public repo or in public exports, so the
community can carry it without Ethan. The running site costs nothing per visitor beyond hosting.

## Decisions Ethan made

- **Nothing is excluded by category.** Software, AI tools, games: if people pay for it and want a
  free version, it belongs. Whether a good free version exists is what the platform finds out.
- **Two ways in, equal weight.** By name ("stop paying for Calendly", "GTA 6 for free") or by need
  ("something that books cake orders and takes a deposit"). The platform's core value is matching
  the two together with what is actually being built.
- **The seed is found from data, not guessed.** A hand-picked list of 40 tools was rejected.
- **The site never calls an AI model.** No API bill. Matching on the site is free database
  matching. Claude is used only when a contributor runs the matcher locally on their own key or
  Claude Code plan, and its output arrives as a pull request.
- **No single human gatekeeper.** Admin curation stays possible but is not the engine.
- **Signals:** anyone can give one, sign-in optional (like today's hearts). Signing in ties them to
  a person page and counts them once across devices.
- **Email sign-in ships now**, as a branded email sent through Resend from `hello@antipaywall.org`.
- **Season 1 still starts at 100+ builders** and a confirmed pool holder. Unchanged.
- **Repo profiles for every tracked repo**, with star history, license, contributors and activity,
  plus a shareable star-growth chart a maintainer can embed in their README.
- **SEO:** topic pages and paid-product pages are what we try to rank. A repo page is indexable
  once it carries something GitHub does not show; otherwise it is `noindex` until it does.
- `GITHUB_TOKEN` is free; Ethan creates one when needed.
- Same database as production, additive migrations only, each applied only on Ethan's yes.

## Goals for the first version

1. Paid-product pages (`/free-alternatives/<slug>`) from a data-found seed, with GitHub-synced
   projects, demand signals, what's still missing, and help-wanted issues.
2. Gap pages (the existing `/ideas/<slug>`) with signals, duplicate search on posting, merging,
   claiming, closest projects and status.
3. A home page built around search, paid products and top gaps.
4. Person pages for backers and builders, merged into the builder profile (PR #6/#7 slots).
5. A season page fed by live data, with briefs from top gaps.
6. Repo profiles (`/projects/<owner>/<repo>`), topic pages (`/topics/<topic>`) and the embeddable
   star chart (`/chart/<owner>/<repo>.svg`).
7. Email sign-in for backers.
8. The open catalog in the repo, the daily GitHub sync, `pnpm match`, and the open data export.

## Non-goals (designed for, not built)

- The Antipaywall GitHub App (labeled issues kept in sync by maintainers' installs).
- The repo protocol file (`antipaywall.yml` in a repo).
- Crowdfunding or bounties on gaps.
- A free local similarity model for matching (the next step if word matching proves weak).
- Community governance mechanisms (who maintains, who organizes): later conversation.

## Anti-goals

- No server-side AI calls, ever, in the running site.
- No pirated copies, cracks, keygens or "free download" links. Antipaywall lists open-source
  projects and wishes only. "GTA 6 for free" shows open-source games and the wish, nothing that
  copies GTA. Repos whose name/description/topics match piracy terms are dropped by the sync.
- No implication that anyone was charged. "Would pay" is always labeled a signal, never money.
- No hosting, forking or rebranding projects. Antipaywall links out.
- No generic SaaS look; the brand system holds.
- No change to the live site until Ethan merges. No destructive migration.
- Nothing mentions Sellbird or Ethan's companies.

## Constraints

- Astro 7 SSR on Vercel, Supabase Postgres, Vitest, pnpm. Build on what exists.
- Same Supabase project as live (`zxvwvmcwaneatciofoaw`). Migrations from `0018`, additive only:
  new tables, new nullable or defaulted columns, new functions/views. No rename, no alter of
  anything the live site reads, no drop. New tables: RLS on, no policies, revoke from
  anon/authenticated; functions granted to service_role only.
- Vercel previews share the live database: anything done on a preview touches real data.
- Public GitHub data only; respect rate limits; never store contributors' emails.
- Plain language a bakery owner understands. No "draft" wording.
- Test emails only to e@ethanplus.ai.

## Approaches considered for matching

- **A. Free word and topic matching on the site** (Postgres full-text, trigram similarity, GitHub
  topics, and per-product plain-word lists). Free and predictable; weak on need-described wishes
  unless the word lists are good.
- **B. Claude reads and judges.** Extract products named, the job in plain words, topics and search
  terms; shortlist with Postgres; judge same / related / closest project and what's missing.
- **C. Human curation** by admins.

**Chosen: A runs the site; B runs only when a contributor runs `pnpm match` locally and opens a PR.**
B's output improves A's inputs (word lists, topics, links, proposed merges) through reviewed files
in the repo. C stays possible (an admin can merge or unlink) but is not the engine. Ethan rejected
server-side B outright because nobody should pay an API bill for the public to use the site.

## The objects

- **Paid product** (`products`): a thing people pay for. Name, slug, category, typical price and
  period (for "saved by switching"), plain words people use for the job, GitHub topics, GitHub
  search terms, aliases, and an optional exclude list. Source of truth: `catalog/products/*.yml`.
- **Project** (`projects`): a public GitHub repo. Never listed by hand; pulled by the sync. Metrics:
  stars, forks, license, archived, last push, created, description, topics, homepage, open issues,
  help-wanted and good-first-issue counts, contributors, latest release, sampled star history.
- **Topic** (`topics`): a GitHub topic we track, with a plain-words name and blurb. Source of truth:
  `catalog/topics.yml`; topics also appear automatically when enough tracked projects share them.
- **Gap**: the existing `ideas` row, extended. Standalone or attached to paid products. Status:
  wanted / being built / exists now. Can be merged into another gap.
- **Signal** (`signals`, plus the existing `idea_hearts` for "me too" on gaps): a stance on a product,
  project or gap. Kinds: `use` (I use a free one / I use this), `switch` (would switch if it did more),
  `pay` (would pay $X a month or once), `test` (send me early builds). Keyed by person when signed in,
  else by the browser's random id (the same cookie hearts use). Never money.
- **Follow**: the generic `follows` table from PR #7 (`subject_kind` person/gap/project/tool/topic).
  Needs sign-in. Following a gap/product/project/topic is built here.
- **Claim** (`gap_claims`): a builder says they are on a gap, with an optional note and repo. Never
  exclusive.
- **Person**: a GitHub or GitLab account (`people`, as today), or an email backer (`backers`, new).
- **Season** (`seasons`, `season_briefs`): Season 1 is the current hackathon.

## Data model (migrations 0018+)

All new tables: RLS on, no policies, revoked from anon and authenticated.

- `products(id uuid pk, slug unique, name, category, price_cents int null, price_period text null
  check in ('month','year','once'), words text[], topics text[], search_terms text[], aliases text[],
  excludes text[], blurb text, created_at, updated_at)`; GIN full-text index over name, aliases, words.
- `topics(slug pk, name, blurb, tracked bool, created_at)`.
- `projects(id uuid pk, github_id bigint unique, full_name unique (lower), owner, name, url,
  description, homepage, topics text[], license_spdx, license_name, stars, forks, open_issues,
  help_wanted int, good_first int, contributors int, archived bool, pushed_at, created_on_github,
  latest_release_tag, latest_release_at, star_points jsonb (array of [date, count]),
  star_points_at, synced_at, listed bool, indexable bool, reject_reason text null)`.
- `project_snapshots(project_id, day date, stars, forks, pk (project_id, day))`: one row per day,
  from the sync; adds precision to star history going forward.
- `project_products(project_id, product_id, source text check in ('topic','search','catalog','tag','pr'),
  score real, pk (project_id, product_id))`.
- `help_issues(project_id, number, title, url, labels text[], comments int, updated_at, pk (project_id, number))`.
- `gap_products(idea_id, product_id, pk)`.
- `ideas` new columns: `build_status text not null default 'wanted' check in ('wanted','building','exists')`,
  `merged_into uuid null references ideas`, `named_products text[] default '{}'`, `backer_id uuid null`
  (an email backer as author), `words text[] default '{}'` (filled from `pnpm match` PRs).
- `idea_hearts` new column: `user_id uuid null` (auth user id), so a signed-in "me too" counts once.
- `signals(id, subject_kind check in ('product','project','gap'), subject_id uuid, kind check in
  ('use','switch','pay','test'), pay_cents int null, pay_period text null check in ('month','once'),
  user_id uuid null, visitor uuid null, created_at, check (user_id is not null or visitor is not null))`;
  unique per (subject_kind, subject_id, kind, coalesce(user_id, visitor)).
- `merge_log(id, from_idea, into_idea, source check in ('poster','pr','admin'), reason, by_user uuid null,
  created_at, undone_at null, undone_by uuid null)` and `merge_blocks(a, b, created_at)`: pairs the
  matcher must never merge again.
- `gap_claims(idea_id, user_id, note, repo_url, created_at, pk)`.
- `backers(id uuid pk references auth.users, name, about, public bool default false, created_at)`.
- `search_misses(query_norm pk, count, first_at, last_at)`: no person, no visitor id, no IP.
- `seasons(id int pk, name, status check in ('collecting','open','building','voting','done'),
  starts_at null, ends_at null)`; `season_briefs(season_id, idea_id, rank, pk)`.
- `sync_log(id, kind, started_at, finished_at, ok, note)`: the "synced 2 hours ago" line.
- Functions (service_role only): `gap_demand(idea ids)`, `product_demand(product id)`,
  `match_candidates(text)` (full-text + trigram over products, gaps, projects), `claim_signals(visitor, user)`
  (moves a browser's signals and hearts to the signed-in user, dropping duplicates), `merge_gap`,
  `unmerge_gap`. Gap demand counts distinct people across a gap and everything merged into it,
  where a person is the user id when known, else the browser id, so merges never double count.

Needs `pg_trgm` (additive extension; available on Supabase).

## The open catalog in the repo

```
catalog/
  products/<slug>.yml   name, category, price, words, topics, search_terms, aliases, excludes
  topics.yml            tracked topics with plain names and blurbs
  links.yml             project ↔ product links added or removed by hand (with a reason)
  merges.yml            gap merges proposed by `pnpm match`, applied by the sync once
  blocklist.yml         repos and words never listed (piracy, malware, spam)
```

The sync upserts the catalog into the database on every run, so a merged PR reaches the site on
the next sync. Products are never created from the website: a wish naming an unknown product is
stored with the name in `named_products`, and `pnpm match` proposes the product file.

## GitHub sync

- Runs as `pnpm sync` (a Node script in `scripts/`), so anyone can run it against their own
  Supabase. Production runs it daily in **GitHub Actions** in the public repo, using Actions' own
  built-in token (free, 1,000 requests/hour for the repo) and two repo secrets Ethan adds:
  `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. The run log is public.
- Per product: GitHub search by its topics and search terms, plus `topic:<slug>-alternative` and
  `topic:antipaywall`. Results go through the junk filter: no license, archived, no push in
  18 months, under 50 stars (all in one `thresholds` config), blocklist words. `antipaywall`-topic repos
  skip the star threshold but not the license or blocklist checks.
- Repo details come from GraphQL in batches of 50 (stars, license, topics, push dates, release,
  labeled issue counts, the issues themselves). Contributors come from one REST call per repo
  (`per_page=1`, read the last page number), refreshed weekly.
- Star history: sampled stargazer pages with dates (about 15 requests per repo, first 40,000 stars),
  fetched once and refreshed monthly; daily snapshots add points from launch on.
- Rate limits: the script reads GitHub's remaining-budget headers and stops cleanly, leaving the rest
  for the next run. Every run writes `sync_log`.

## Matching on the site (free)

`match_candidates(text)`: Postgres full-text and trigram similarity against product names, aliases
and plain-word lists, gap titles/pitches/words, and project names/descriptions/topics. It is used:

- when someone posts a gap: "Is it one of these?" shows matching gaps (back one instead), paid
  products (attach them) and existing projects. The poster picks; picking a gap records a `poster`
  merge in the sense that their signal goes to that gap and nothing new is created;
- in the site search: products first, then gaps, then projects, then topics;
- when a search finds nothing good, the normalized query is counted in `search_misses`.

## `pnpm match` (contributors only, their own key)

Reads the public export (no names), runs Claude to: extract products and the job from each new gap;
suggest words, topics and search terms for products; find gap pairs that are the same wish (skipping
`merge_blocks`); suggest project ↔ product links; propose product files for frequently named
products. It writes file changes under `catalog/` and stops. The contributor opens a PR; review is
ordinary code review. Works with `ANTHROPIC_API_KEY` or by printing a prompt bundle for Claude Code.
The prompts live in `scripts/match/prompts/`.

## Merges

- A merge is public, reasoned, and undoable. The gap page shows "Merged into this one" with each
  merged gap's original title and count.
- Sources: a poster choosing an existing gap at posting time; `catalog/merges.yml` from a merged PR;
  an admin.
- "These aren't the same" (signed in, rate-limited) undoes a merge, adds the pair to `merge_blocks`,
  and is logged with who did it.
- A merged gap's URL redirects to the gap it was merged into.

## Seeding from data

`pnpm seed:research` (run once by the builder, output committed for review):

1. Pool: product names from Hacker News titles and comments matching "alternative to X" and
   "free/open-source version of X" (HN's search API is free), and from GitHub topics named
   `<x>-alternative`.
2. Demand: mentions on HN asking for an alternative, by distinct thread, over five years.
3. Coverage: the best matching repo's stars, recency and license.
4. Rank products by demand. The top 60 or so become `catalog/products/*.yml`. The gap score
   (demand × weak coverage) orders "Wanted, but nobody has built it" on the home page.

The research output (`catalog/research/seed-<date>.json`) is committed so anyone can rerun or
challenge it. Existing ideas in the database (the Season 1 starter ideas) stay as gaps.

## Screens

Brand: milk/ink, six paints, Cabinet Grotesk + Satoshi, key buttons, painted bricks, as in the
mockup and `src/styles/global.css`. Navigation: **Find · Wanted · Hackathon · People**, and sign-in.

1. **Home `/`**: "Find the free version of anything you pay for." Search box (by product or need);
   grid of paid products with free-option counts; "Wanted, but nobody has built it" (top gaps with
   me-too and want/pay counts); "How it keeps growing" (find → signal → contribute → build); the
   current-season banner. The hackathon's current home content moves to the season page.
2. **Paid product `/free-alternatives/<slug>`**: title "Free, open-source alternatives to X", real
   meta description; "Synced from GitHub N ago"; demand box (use / would switch / would pay with
   $ picker, average would-pay labeled a signal); projects (stars, license, last updated, help-wanted,
   "N people use this", I-use-this); "What's still missing" (gaps attached, me-too, add your own);
   "Help wanted across these projects" (real labeled issues). Index `/free-alternatives` by category.
3. **Project `/projects/<owner>/<repo>`**: what it is, license in plain words, stars and star chart,
   contributors, last push, release, help-wanted issues, paid products it replaces, gaps it partly
   meets, similar projects, "I use this", follow, and "Put this chart in your README" with the embed
   code and paint/size options.
4. **Chart `/chart/<owner>/<repo>.svg`**: star growth in the brand paints, `?paint=` and `?w=` options,
   cached a day, links back via the README embed snippet.
5. **Topic `/topics/<topic>`**: plain-words intro, the repos (sortable by stars, growth, recently
   active), paid products in the topic, open gaps in the topic. Index `/topics`.
6. **Gap `/ideas/<slug>`** (existing URL, nav label "Wanted"): status; poster, products it replaces,
   the wish in their words; demand meters (want, would pay, will test) with total would-pay as a
   signal; closest projects with what's missing (from the idea's write-up and existing repos, then
   matcher-suggested); "Merged into this one"; "Builders on it" with claim and shared repo; follow;
   the season it's a brief for. Posting (`/ideas/new`) gets the "Is it one of these?" step.
7. **Person**: builders at `/builders/<handle>` (PR #7's layout; this work fills
   `PersonStats.astro` and `PersonWants.astro`): ideas backed, total would-pay, builds tested,
   saved by switching; "What they want" with Switched / Being built / Wanted filters; builds and
   claims. Email backers at `/people/<id>` with the same two sections, public only if they say so.
8. **Season `/hackathon`** (also `/seasons/1`): free to enter, one week, builders vote, public ballots,
   pool held by Open Source Collective; builder count and progress to 100; amount pledged; briefs
   (top gaps by demand now, frozen into `season_briefs` when the season opens); nine winners
   30/18/12/5×6 plus 10% Community Choice; who's building; "Season 2 briefs are collecting now".
9. **Search `/search?q=`**: grouped results; empty results say so plainly and offer "Add what's missing".
10. **Open data `/open-data/*.json`**: products, topics, projects (metrics only), gaps (titles, text,
    counts, no names), merges with reasons. Licensed CC0.

## Email sign-in

`/auth/email` takes an address, makes a sign-in link with Supabase's admin `generateLink` on the
server, and sends it through the existing Resend sender as a plain Antipaywall email. The link lands
on `/auth/callback?provider=email`, which creates a `backers` row (never a `people` row; the
people table only allows GitHub or GitLab). Email backers can signal, follow, post gaps and have a
person page, but cannot join as hackathon builders (the builder checks need GitHub or GitLab).
Rate-limited with the existing `rate_events`. Sending a sign-in email adds nobody to the email list.

## SEO

- Real titles and meta descriptions per page; canonical URLs; JSON-LD `ItemList` on product and topic
  pages; the sitemap lists products, topics, indexable projects and listed gaps.
- `projects.indexable` is true when the repo has at least one of: a paid product link, a gap link,
  star history, or 200+ stars with a push in the last year. Otherwise the page has `noindex`.

## Settled after the builder check

- **0016 (profiles) and 0017 (social) are already applied to production**, so `follows` is fixed:
  `follower_id` references `people`, `subject_id` is a uuid. Consequences (builder's calls):
  - `topics` gets a uuid `id` (slug stays unique) so topics can be followed.
  - The `'tool'` follow kind means a paid product.
  - **Email backers cannot follow in the first version.** Following asks them to sign in with
    GitHub or GitLab. They can still signal, post gaps and claim nothing (claims are for builders).
- **Email backers posting gaps:** `ideas.author_id` is already nullable (0011). A backer's gap has
  `author_id` null and `backer_id` set. The platform's own views name the backer; the live site's old
  view would show it as posted by Antipaywall until the merge (only possible from a preview).
- **Same person, email then GitHub:** Supabase links identities that share a confirmed email to one
  auth user. Everything here keys on that auth user id (`user_id`), so signals and hearts stay together.
  A person with a `people` row uses `/builders/<handle>`; `/people/<id>` redirects there.
- **Hearts are deduplicated when counted, not stored once:** `idea_hearts` keeps its key; the new
  `user_id` column lets counts treat one person's hearts from two browsers as one.
- **The sync runs in `antipaywall/platform`** (public), the repo's `origin`.
- **Home page (Ethan):** the directory becomes `/` when this merges, with a large Season 1 banner and
  Join near the top. The PR opens only after the sync has filled the directory.

## Rules carried over

Free to use, free to enter. Signals are never money. Antipaywall links, never hosts. Public GitHub
data only. Plain language. Existing sign-in, signups, pledges, ideas and admin keep working.

## Left to the builder

Page component structure, exact SQL, test layout, chart drawing, the junk thresholds' starting values,
copy wording within the brand voice, and the order of work (in the plan).

## What Ethan has to do

- Say yes to each migration before it is applied to production.
- Add `SUPABASE_URL` and `SUPABASE_SECRET_KEY` as GitHub Actions secrets on antipaywall/platform
  before the first scheduled sync (the first sync can be run once locally on his yes instead).
- Optionally create a free `GITHUB_TOKEN` for Vercel (live GitHub search on posting).
- Merge PR #7 into `feat/platform`, and merge the final PR.
