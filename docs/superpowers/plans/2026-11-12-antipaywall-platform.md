# Antipaywall Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn antipaywall.org into the directory of free, open-source alternatives (paid products, projects, topics, gaps, signals, people, seasons), with Season 1 of the hackathon living inside it.

**Architecture:** Astro 7 SSR pages read Supabase through the server-only admin client, as today. An open catalog in `catalog/` (YAML) plus a daily GitHub sync script (`scripts/sync.ts`, run in GitHub Actions) fill new tables. Matching on the site is Postgres full-text + trigram only; Claude runs only in the contributor tool `pnpm match`, whose output is a PR.

**Tech Stack:** Astro 7, @astrojs/vercel, @supabase/supabase-js, Vitest, pnpm, `yaml` (new), `tsx` (new dev), GitHub REST + GraphQL, Hacker News Algolia API, Resend.

**Spec:** `docs/superpowers/specs/2026-11-12-antipaywall-platform-design.md`

## Global Constraints

- Migrations start at `0018`, additive only: no `drop`, `rename`, `alter column ... type`, `set not null`, or constraint changes on existing objects. New tables: `enable row level security` and `revoke all ... from anon, authenticated`; functions `revoke execute ... from public, anon, authenticated` and `grant execute ... to service_role`; `security invoker set search_path = ''`.
- No migration is applied to production (`zxvwvmcwaneatciofoaw`) without Ethan's yes in chat, one migration at a time.
- The running site never calls an AI model. `ANTHROPIC_API_KEY` is read only by `scripts/match/`.
- Signals are never money: every would-pay figure on a page carries the words "a signal, not money" (or "not a payment") within the same block.
- Antipaywall links to projects and never hosts, forks or rebrands them; no piracy terms reach a page (blocklist).
- Public GitHub data only; never store an email address from GitHub.
- Copy: plain language, no "draft", no filler (enforced by `tests/pages.test.ts`), no mention of Sellbird or Ethan's companies, no HTML comments in `.astro` files.
- Brand: classes and tokens from `src/styles/global.css` and `page.css` (`key`, `brick p1..p6`, `card`, milk/ink); new styles go in `src/styles/platform.css`.
- Test emails go to e@ethanplus.ai only.
- Commit to `feat/platform` only. Never merge.

## Review Focus

1. **A visitor with no cookie and no sign-in presses a signal button** → it works (cookie created), counts once, and pressing again removes it. Test in Task 5.
2. **One person signals from a browser, then signs in on another device that already signalled** → counts stay at one per person after `claim_signals`. Test in Task 5 (SQL fixture) and Task 2 (`demandKey`).
3. **A gap merged into another, where the same person backed both** → the target's count includes that person once. Test in Task 7.
4. **GitHub runs out of rate budget mid-sync** → the run stops cleanly, writes `sync_log` with `ok=false, note='rate limit'`, and keeps everything already written. Test in Task 4.
5. **A search query with SQL wildcard or tsquery syntax (`%`, `_`, `&`, `!`, `:*`, quotes)** → no error, sensible results. Test in Task 6.

---

### Task 1: Migration 0018 and the additive-only guard

**Files:**
- Create: `supabase/migrations/0018_platform.sql`
- Create: `tests/migrations.test.ts`

**Interfaces:**
- Produces tables/columns exactly as in the spec's "Data model" and "Settled after the builder check" sections: `products`, `topics` (uuid `id`, unique `slug`), `projects`, `project_snapshots`, `project_products`, `help_issues`, `gap_products`, `signals`, `merge_log`, `merge_blocks`, `gap_claims`, `backers`, `search_misses`, `seasons` (row `(1,'Season 1','collecting')` inserted), `season_briefs`, `sync_log`; columns `ideas.build_status/merged_into/named_products/backer_id/words`, `idea_hearts.user_id`.
- Produces functions (service_role only):
  - `match_candidates(p_q text, p_limit int default 8) returns json` → `{products:[{slug,name,score}], gaps:[{slug,title,score}], projects:[{full_name,description,stars,score}], topics:[{slug,name,score}]}`; listed, unmerged gaps only.
  - `gap_demand(p_ids uuid[]) returns table(idea_id uuid, want int, pay int, pay_cents_month bigint, pay_cents_once bigint, test int)` — counts across the gap and every gap with `merged_into` = it, one per `coalesce(user_id, visitor)`.
  - `product_demand(p_id uuid) returns json` → `{use, switch, pay, avg_pay_cents_month}`.
  - `claim_signals(p_visitor uuid, p_user uuid) returns void` — sets `user_id` on that visitor's signals and hearts, deleting rows that would duplicate the user's existing ones.
  - `merge_gap(p_from uuid, p_into uuid, p_source text, p_reason text, p_by uuid) returns void`; `unmerge_gap(p_from uuid, p_by uuid) returns void` (sets `undone_at`, inserts both orderings' smaller-first pair into `merge_blocks`).
  - `site_platform_stats() returns json` → `{products, projects, gaps, signals, synced_at}`.
- `create extension if not exists pg_trgm with schema extensions;` and trigram indexes on `products.name`, `ideas.title`, `projects.full_name`.

- [ ] **Step 1: Write `tests/migrations.test.ts`** with: `it('keeps every migration from 0018 on additive')` — for each `supabase/migrations/00(1[8-9]|[2-9]\d)_*.sql`, after stripping `--` comments, expect no match of `/\bdrop\s+(table|column|view|function|index|constraint)\b|\brename\b|\balter\s+column\b[^;]*\b(type|set not null|drop)\b/i` except `drop ... if exists` on objects created in the same file; `it('turns on row-level security for every new table')` — every `create table public.X` has `alter table public.X enable row level security` and `revoke all on public.X from anon, authenticated`; `it('gives new functions to service_role only')` — every `create (or replace )?function public.F(` has a matching `grant execute on function public.F` `to service_role` and a revoke from `public, anon, authenticated`.
- [ ] **Step 2: Run** `pnpm vitest run tests/migrations.test.ts` — expect FAIL (no 0018 file yet → the "every table" tests pass vacuously; add `it('has a 0018 migration')` asserting the file exists, which fails).
- [ ] **Step 3: Write `0018_platform.sql`** per the Interfaces block. `signals` uniqueness: `create unique index signals_one on public.signals (subject_kind, subject_id, kind, coalesce(user_id, visitor))`. `idea_hearts.user_id` gets an index. `gap_demand` "want" = distinct `coalesce(user_id, visitor)` over `idea_hearts` for the gap set.
- [ ] **Step 4: Run** `pnpm vitest run tests/migrations.test.ts` — expect PASS.
- [ ] **Step 5: Apply to a throwaway local check:** run the SQL through `mcp execute_sql` inside `begin; ... rollback;` against production? **No.** Instead ask Ethan in one line: "Apply 0018_platform (new tables only, nothing existing changed) to production?" and apply only on yes via `apply_migration` name `platform`. Then `select count(*) from public.seasons` → 1.
- [ ] **Step 6: Commit** `git add supabase/migrations/0018_platform.sql tests/migrations.test.ts && git commit -m "feat: platform tables for products, projects, signals, merges and seasons"`

### Task 2: The open catalog and its loader

**Files:**
- Create: `catalog/topics.yml`, `catalog/links.yml`, `catalog/merges.yml`, `catalog/blocklist.yml`, `catalog/README.md`, `catalog/products/` (filled in Task 3)
- Create: `src/lib/catalog.ts`, `tests/catalog.test.ts`
- Modify: `package.json` (deps `yaml`; devDeps `tsx`)

**Interfaces:**
- Produces `type Product = { slug: string; name: string; category: Category; price?: { cents: number; period: 'month'|'year'|'once' }; words: string[]; topics: string[]; search_terms: string[]; aliases: string[]; excludes: string[]; blurb: string }`.
- `const CATEGORIES = ['Scheduling','Forms and surveys','Video and calls','Docs and notes','Design','Email and newsletters','Analytics','Support and chat','Project management','Files and storage','Passwords and security','Writing','Social media','Selling online','Websites','Money and invoicing','Automation','AI tools','Games','Developer tools','Other'] as const`.
- `parseProduct(raw: unknown, file: string): Product` (throws `CatalogError` naming the file and field); `loadCatalog(dir = 'catalog'): { products: Product[]; topics: Topic[]; links: Link[]; merges: Merge[]; blocklist: { repos: string[]; words: string[] } }` (Node fs, used by scripts and tests only, never by pages).
- `type Topic = { slug: string; name: string; blurb: string }`, `type Link = { project: string; product: string; action: 'add'|'remove'; reason: string }`, `type Merge = { from: string; into: string; reason: string }`.
- `isBlocked(text: string, words: string[]): boolean` — word-boundary, case-insensitive.

- [ ] **Step 1: Tests** — `parseProduct` rejects a slug that isn't `^[a-z0-9]+(-[a-z0-9]+)*$`, a name over 60 chars, an unknown category, a price with negative cents, more than 40 words; accepts a minimal `{slug:'calendly', name:'Calendly', category:'Scheduling', blurb:'Booking links for meetings.'}` with empty arrays defaulted. `it('loads every file in catalog/ without errors')` over the real directory. `it('has unique slugs')`. `isBlocked('GTA 6 free download crack', ['crack','keygen'])` → true; `isBlocked('Crackle chat', ['crack'])` → false.
- [ ] **Step 2: Run** `pnpm vitest run tests/catalog.test.ts` → FAIL.
- [ ] **Step 3: Implement** `src/lib/catalog.ts`; write `catalog/blocklist.yml` words: crack, cracked, keygen, warez, torrent, pirate, piracy, nulled, serial key, free download, activator, license bypass, cheat engine, aimbot. Seed `topics.yml` with the topics used by Task 3's products (name and one-sentence blurb each). `catalog/README.md`: how to add a product, a link, a merge, and how files reach the site (next sync).
- [ ] **Step 4: Run** tests → PASS.
- [ ] **Step 5: Commit** `feat: open catalog of paid products, topics, links and merges`

### Task 3: Seed research from public demand data

**Files:**
- Create: `scripts/seed-research.ts`, `src/lib/research.ts`, `tests/research.test.ts`
- Create (output): `catalog/research/seed-2026-11-12.json`, `catalog/products/*.yml` (~60)
- Modify: `package.json` scripts `"seed:research": "tsx scripts/seed-research.ts"`

**Interfaces:**
- Consumes: `parseProduct`, `CATEGORIES` (Task 2).
- Produces `extractAlternativeTo(text: string): string[]` (product names after "alternative to", "alternatives to", "free version of", "open-source version of", "replacement for"; stops at `,` `.` `(` `-` `–` `and` `or` `for` `that` `with`; keeps 1–3 capitalized words; returns `[]` for lowercase-only), `normalizeProduct(name: string): string` (lowercase, strip `.com/.io/.ai/.app`, trim punctuation), `rankCandidates(rows: {name: string; threads: number; coverageStars: number}[]): {name: string; demand: number; coverage: number; gapScore: number}[]` with `gapScore = demand * (1 / (1 + log10(1 + coverageStars)))`.

- [ ] **Step 1: Tests** — `extractAlternativeTo('Show HN: Cal.com – open-source alternative to Calendly')` → `['Calendly']`; `('An open source alternative to Google Analytics, Mixpanel')` → `['Google Analytics']`; `('Ask HN: Free version of GTA 6?')` → `['GTA 6']`; `('alternative to nothing in particular')` → `[]`. `normalizeProduct('Notion.so')` → `'notion'`. `rankCandidates` puts `{threads: 40, coverageStars: 0}` above `{threads: 40, coverageStars: 30000}`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `src/lib/research.ts`.
- [ ] **Step 4: Implement `scripts/seed-research.ts`**: HN Algolia `search_by_date` over stories and comments for each phrase, paged by `numericFilters=created_at_i<…` windows across 5 years, ≤ 1 request/second; count distinct `story_id` per normalized name; keep names with ≥ 3 threads; coverage = stars of the top GitHub search result for `topic:<name>-alternative` else `"<name> alternative"` (unauthenticated: 10/min, sleep 6.5 s; or `GITHUB_TOKEN` if set). Write the JSON (all candidates with counts and query dates). Then the builder (not the script) writes `catalog/products/<slug>.yml` for the top ~60 by `demand`, skipping names that are not paid products (open-source projects, companies with no product, people), filling category, price (public list price, lowest paid tier, `month`), words (8–20 plain words a non-coder would use for the job), topics, search_terms, aliases.
- [ ] **Step 5: Run** `pnpm seed:research` → JSON written; `pnpm vitest run` → catalog and research tests PASS.
- [ ] **Step 6: Commit** `feat: seed the catalog from Hacker News demand and GitHub coverage` (include the JSON).

### Task 4: GitHub sync

**Files:**
- Create: `src/lib/sync/github.ts`, `src/lib/sync/filter.ts`, `src/lib/sync/stars.ts`, `src/lib/sync/license.ts`, `scripts/sync.ts`, `.github/workflows/sync.yml`
- Create: `tests/sync.test.ts`
- Modify: `package.json` scripts `"sync": "tsx scripts/sync.ts"`

**Interfaces:**
- Consumes: `loadCatalog`, `isBlocked` (Task 2).
- `THRESHOLDS = { minStars: 50, maxMonthsSincePush: 18, requireLicense: true }` in `filter.ts`; `passesFilter(r: RepoFacts, blocklist: {repos: string[]; words: string[]}, now: Date): { ok: true } | { ok: false; reason: 'no_license'|'archived'|'stale'|'few_stars'|'blocked'|'fork' }` — `antipaywall` topic skips `few_stars` only.
- `type RepoFacts = { githubId: number; fullName: string; url: string; description: string|null; homepage: string|null; topics: string[]; licenseSpdx: string|null; licenseName: string|null; stars: number; forks: number; openIssues: number; helpWanted: number; goodFirst: number; archived: boolean; fork: boolean; pushedAt: string; createdAt: string; latestReleaseTag: string|null; latestReleaseAt: string|null }`.
- `searchQueries(p: Product): string[]` — one per topic `topic:<t>`, one per search term `"<term>" in:name,description`, plus `topic:<slug>-alternative`; global query `topic:antipaywall`. All suffixed ` archived:false fork:false`.
- `class GithubBudget { constructor(min = 50); update(headers: Headers): void; get exhausted(): boolean }` and `class RateLimited extends Error`.
- `fetchRepoBatch(names: string[], token: string, f?: typeof fetch): Promise<{ repos: RepoFacts[]; issues: Map<string, HelpIssue[]> }>` — one GraphQL query, ≤ 50 names, aliases `r0..r49`, issues `labels: ["help wanted","good first issue"], states: OPEN, first: 10`.
- `type HelpIssue = { number: number; title: string; url: string; labels: string[]; comments: number; updatedAt: string }`.
- `samplePages(totalStars: number, samples = 15): number[]` — page numbers (per_page=100) evenly spread over `min(ceil(total/100), 400)`, always including 1 and the last; `starPointsFromSamples(samples: {page: number; firstStarredAt: string}[], total: number, now: Date): [string, number][]` — `[date, (page-1)*100+1]` per sample plus `[today, total]`.
- `plainLicense(spdx: string|null): { label: string; words: string }` — e.g. `MIT` → `"Free to use, change and sell, even in paid products. Keep the copyright notice."`; `AGPL-3.0` → `"Free to use and change. If you run a changed version for others online, you must share your changes."`; GPL-2.0/3.0, LGPL, Apache-2.0, BSD-2/3, MPL-2.0, ISC, Unlicense, CC0-1.0; unknown → `"See the project's license file."`.
- `isIndexable(p: { productLinks: number; gapLinks: number; hasStarPoints: boolean; stars: number; pushedAt: string }, now: Date): boolean` (spec's SEO rule).
- `scripts/sync.ts` order: write `sync_log` start → upsert catalog (products, topics; apply `links.yml`; apply each `merges.yml` entry via `merge_gap(..., 'pr', reason, null)` once, skipping any already in `merge_log` or `merge_blocks`) → search per product (≤ 30/min) collecting names → `fetchRepoBatch` → filter → upsert `projects` (`listed=false, reject_reason` when filtered), `project_products` (`source` topic/search/catalog/tag), `help_issues` (replace per project), `project_snapshots` for today → contributors (REST `per_page=1&anon=0`, last page from `Link`) for projects whose `synced_at` contributor field is older than 7 days → star samples for projects with `star_points_at` null or older than 30 days, ≤ 200 projects per run → compute `indexable` → write `sync_log` finish. Every GitHub response goes through `budget.update`; `budget.exhausted` throws `RateLimited`, caught at top level → `sync_log ok=false note='rate limit'`, exit 0.
- Env: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `GITHUB_TOKEN` (Actions provides `${{ secrets.GITHUB_TOKEN }}`).
- Workflow: `on: schedule: - cron: '17 6 * * *'` and `workflow_dispatch`; `permissions: contents: read`; node 22; `pnpm install --frozen-lockfile`; `pnpm sync`; `timeout-minutes: 60`.

- [ ] **Step 1: Tests** — `passesFilter` for each reason (no license → `no_license`; `archived` → `archived`; push 19 months ago → `stale`; 49 stars → `few_stars`; 49 stars with topic `antipaywall` → ok; description "GTA free download crack" → `blocked`). `samplePages(250)` → `[1,2,3]`; `samplePages(1_000_000)` has length 15, starts 1, ends 400, strictly increasing. `starPointsFromSamples` last point is `[today, total]`. `plainLicense('MIT').label` → `'MIT'`. `isIndexable` true with one product link; false with none and 150 stars. **Review Focus 4:** `GithubBudget` with header `x-ratelimit-remaining: 10` → `exhausted` true; a fake sync step given an exhausted budget throws `RateLimited`. `fetchRepoBatch` with a stubbed fetch returning a fixture GraphQL body maps fields into `RepoFacts` and issues.
- [ ] **Step 2: Run** `pnpm vitest run tests/sync.test.ts` → FAIL. **Step 3: Implement** the four lib files. **Step 4:** Run → PASS.
- [ ] **Step 5: Implement `scripts/sync.ts` and the workflow.** Add a `--dry-run` flag that does everything except database writes and prints counts.
- [ ] **Step 6:** `GITHUB_TOKEN=$(gh auth token) pnpm sync --dry-run` → prints per-product repo counts with no errors. (Uses Ethan's local `gh` login read-only for public data; no credential is created or stored.)
- [ ] **Step 7:** Ask Ethan in one line: "Run the first sync now against production (fills only the new tables)?" On yes, run `pnpm sync` locally with the env from `.env` and `GITHUB_TOKEN=$(gh auth token)`. Check `select count(*) from projects where listed` > 0.
- [ ] **Step 8: Commit** `feat: daily GitHub sync for projects, issues and star history`

### Task 5: Signals (anyone, sign-in optional)

**Files:**
- Create: `src/lib/signals.ts`, `src/pages/api/signal.ts`, `src/components/SignalBox.astro`, `src/components/UseToggle.astro`, `tests/signals.test.ts`
- Modify: `src/pages/api/heart.ts` (write `user_id` when signed in), `src/pages/auth/callback.ts` (call `claim_signals` after a successful sign-in), `src/middleware.ts` (set `locals.userId` from the auth user, and `locals.backer`), `src/env.d.ts`

**Interfaces:**
- `type SubjectKind = 'product'|'project'|'gap'`; `type SignalKind = 'use'|'switch'|'pay'|'test'`.
- `parseSignal(form: FormData): { ok: true; subjectKind: SubjectKind; subjectId: string; kind: SignalKind; on: boolean; payCents: number|null; payPeriod: 'month'|'once'|null } | { ok: false; code: MessageCode }` — `pay` requires cents in `PAY_CHOICES = { month: [300, 500, 1000, 2000, 5000], once: [500, 1000, 2500, 5000, 10000] }`.
- `toggleSignal(db, s, who: { userId: string|null; visitor: string }): Promise<void>`; `signalsOf(db, who, subjectKind, ids: string[]): Promise<Map<string, Set<SignalKind>>>`; `isBacker(db, userId: string): Promise<boolean>` (≥ 1 signal or heart with that `user_id`); `demandKey(userId: string|null, visitor: string): string`.
- `/api/signal` POST: origin-checked by middleware, rate-limited with `takeSlot` (kind `'signal'`, 120/hour/IP-day key), `ensureVisitorId`, responds with JSON `{ on, counts }` for `fetch` callers and a redirect `back(next)` otherwise (works without scripts).
- `SignalBox.astro` props `{ kind: 'product'|'project'|'gap'; id: string; counts; mine: Set<SignalKind>; avgPayCents?: number; options: SignalKind[] }`; renders the mockup's `.opt` buttons as `<form method="post" action="/api/signal">` buttons with `aria-pressed`; a small inline script upgrades to fetch. Always shows "A signal, not a payment."

- [ ] **Step 1: Tests** — `parseSignal` rejects unknown kind, non-uuid id, pay with 777 cents, pay with no period; accepts `pay` 500 `month`. `demandKey(null,'v')` → `'v:v'`, `demandKey('u','v')` → `'u:u'`. **Review Focus 1:** with a fake db recording calls, `toggleSignal` with `on: true` inserts and with `on: false` deletes the same key. **Review Focus 2:** after the migration is applied, a SQL check run by the builder via `execute_sql` inside `begin … rollback`: insert two signals for visitor A and B on one subject, `claim_signals(A, U)`, `claim_signals(B, U)` → one row remains.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: signals anyone can give, tied to a person when signed in`

### Task 6: Free matching and search

**Files:**
- Create: `src/lib/match.ts`, `src/pages/search.astro`, `tests/match.test.ts`

**Interfaces:**
- `normalizeQuery(q: string): string` — lowercase, NFKC, strip everything but letters, digits, spaces, `.`, `+`, `#`; collapse spaces; max 100 chars.
- `findMatches(db, q: string, limit = 8): Promise<Matches>` → calls `match_candidates`; `type Matches = { products: {slug: string; name: string}[]; gaps: {slug: string; title: string}[]; projects: {fullName: string; description: string|null; stars: number}[]; topics: {slug: string; name: string}[] }`.
- `isWeak(m: Matches): boolean` — no products and no gaps. On a weak result the search page upserts `search_misses` (`count = count + 1`, `last_at = now()`) for `normalizeQuery(q)` when its length ≥ 3.
- `/search?q=` groups: "Paid products", "Wanted", "Open-source projects", "Topics"; empty: "Nothing yet for "{q}". Add it as something you want." linking `/ideas/new?title=`.

- [ ] **Step 1: Tests** — **Review Focus 5:** `normalizeQuery("a%_b & !c:* 'd'")` → `'a b c d'`; `normalizeQuery('C++ / C#')` → `'c++ c#'`; length capped at 100. `isWeak` true for empty products and gaps.
- [ ] **Step 2–4:** FAIL → implement → PASS. Builder check: `select public.match_candidates('book cake orders with a deposit')` returns Calendly among products once Task 3 words are synced.
- [ ] **Step 5: Commit** `feat: free search across products, gaps, projects and topics`

### Task 7: Gap pages, posting with "Is it one of these?", merges and claims

**Files:**
- Modify: `src/pages/ideas/[slug].astro`, `src/pages/ideas/new.astro`, `src/pages/api/ideas.ts`, `src/lib/postIdea.ts`, `src/lib/db.ts` (extend `Idea` with `buildStatus`, `mergedInto`, `productSlugs`)
- Create: `src/lib/gaps.ts`, `src/pages/api/gaps/merge.ts`, `src/pages/api/gaps/unmerge.ts`, `src/pages/api/gaps/claim.ts`, `src/pages/api/follow-subject.ts`, `tests/gaps.test.ts`

**Interfaces:**
- Consumes: `findMatches` (6), `SignalBox` (5), `gap_demand`, `merge_gap`, `unmerge_gap` (1).
- `getGapPage(db, slug): Promise<{ idea: Idea; demand: Demand; merged: { slug: string; title: string; want: number; reason: string; source: string }[]; products: {slug: string; name: string}[]; closest: ClosestProject[]; claims: Claim[]; season: { id: number; name: string } | null } | { redirect: string } | null>` — a merged gap returns `{ redirect: '/ideas/<target>' }` (301).
- `type Demand = { want: number; pay: number; payMonthCents: number; payOnceCents: number; test: number }`.
- `type ClosestProject = { fullName: string; url: string; stars: number; does: string; missing: string | null }` — from `existing_repos` joined to `projects`, `missing` from the idea's `missing` field for the top one, else null.
- Posting: `/ideas/new` step 1 takes the wish; POST `/api/ideas` with `step=check` returns the page with matches ("Is it one of these?": back an existing gap = heart it and go there; attach products = checkboxes; "None of these, post mine"). Email backers post with `backer_id`. `named_products` = names the matcher found in the text that are not in `products`.
- Merge API: signed-in only, `merge_gap(..., 'poster'|'admin')` (admin via `isAdmin`); unmerge: any signed-in person, rate-limited 10/day, logged.
- Claim API: signed-in GitHub/GitLab people only, toggles `gap_claims`, optional note ≤ 140, repo URL must start `https://github.com/` or `https://gitlab.com/`.
- Follow API `/api/follow-subject`: `subject_kind` in gap/project/tool/topic, people only (email backers get `signin_for_follow`).

- [ ] **Step 1: Tests** — **Review Focus 3:** a pure `mergeCounts(target: string[], merged: string[][]): number` (keys) → `mergeCounts(['u:1','v:a'], [['u:1','v:b']])` = 3; the SQL `gap_demand` is checked the same way by the builder in `begin … rollback`. `getGapPage` on a merged slug returns a redirect (fake db). Claim repo URL `http://github.com/x` rejected.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** The page follows the mockup's Idea artboard: status chip (wanted / being built / exists now), "Picked for Season 1" chip when in `season_briefs`, the wish, "Posted by", replaces, follow and "I'd build this"; "Who wants it" meters + SignalBox (`want` = heart toggle, `pay`, `test`); "Closest things that exist"; "Merged into this one" with "These aren't the same" per row; "Builders on it" on the wall band; season card.
- [ ] **Step 6: Commit** `feat: gap pages with demand, duplicate check on posting, merges and claims`

### Task 8: Email sign-in for backers

**Files:**
- Create: `src/pages/auth/email.astro`, `src/pages/api/auth/email.ts`, `src/lib/backers.ts`, `tests/backers.test.ts`
- Modify: `src/pages/auth/callback.ts` (branch `provider=email`), `src/lib/email.ts` (`signInEmail(to, link)`), `src/lib/respond.ts` (codes `email_link_sent`, `signin_for_follow`), `src/components/SignIn.astro` (an "Or use your email" link), `src/middleware.ts`

**Interfaces:**
- `signInEmail(to: string, link: string): Email` — subject "Your Antipaywall sign-in link"; text says the link works once for an hour and that nobody is added to any list.
- `/api/auth/email` POST: `parseEmail`, rate-limit 5/hour/IP-day key and 3/hour per address, `db.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: origin + '/auth/callback?provider=email&next=…' } })`, send with the existing Resend sender; always respond `email_link_sent` (no account probing).
- Callback `provider=email`: `verifyOtp` with the token hash from `generateLink`'s `properties.hashed_token` (link built as `/auth/callback?provider=email&token_hash=…&type=magiclink&next=…`), upsert `backers(id)`, `claim_signals(visitor, user.id)`, redirect. Never writes `people`, never adds to the list.
- `locals.backer: { id: string; name: string|null; public: boolean } | null`; `locals.userId: string | null` (set for both kinds).

- [ ] **Step 1: Tests** — `signInEmail('e@ethanplus.ai', 'https://x/y')` includes the link and "one hour"; the API refuses a malformed address with `bad_email`; the success code is the same for a known and unknown address.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** On the preview, request a link for e@ethanplus.ai only; open it; land signed in; `select * from backers` shows one row.
- [ ] **Step 6: Commit** `feat: sign in by email for backers, sent from Antipaywall`

### Task 9: Paid product pages

**Files:**
- Create: `src/pages/free-alternatives/index.astro`, `src/pages/free-alternatives/[slug].astro`, `src/lib/products.ts`, `src/styles/platform.css`, `tests/products.test.ts`

**Interfaces:**
- `getProductPage(db, slug): Promise<{ product; projects: ProjectCard[]; missing: { slug: string; title: string; want: number }[]; issues: (HelpIssue & { project: string })[]; demand: { use: number; switch: number; pay: number; avgPayMonthCents: number|null }; syncedAt: string|null } | null>`.
- `type ProjectCard = { fullName: string; name: string; url: string; description: string|null; stars: number; license: string|null; pushedAt: string; helpWanted: number; users: number }` — sorted by `users` desc then stars.
- `productTitle(name)` → `"Free, open-source alternatives to ${name}"`; `productDescription(p, n)` → `"${n} free, open-source alternatives to ${name}, pulled from GitHub, with what people say is still missing."` (≤ 160 chars).
- `timeAgo(iso: string, now: Date): string` → "2 hours ago", "yesterday", "3 days ago".
- JSON-LD `ItemList` of the projects.

- [ ] **Step 1: Tests** — `productTitle('Calendly')`; `productDescription` ≤ 160 chars for a 60-char name; `timeAgo` for 2 h, 26 h, 3 d.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Page follows the Tool artboard: breadcrumb Find / category / name; chips (synced ago, N projects, topics); SignalBox (`use`, `switch`, `pay` with picker, average); project cards with UseToggle; "What's still missing" with me-too hearts and "Add what's missing" → `/ideas/new?product=<slug>`; help-wanted bricks (real issues, labelled with repo and label). Index page groups by category with free-option counts.
- [ ] **Step 6: Commit** `feat: a page of free alternatives for every paid product`

### Task 10: Project profiles and the README star chart

**Files:**
- Create: `src/pages/projects/[owner]/[repo].astro`, `src/pages/chart/[owner]/[repo].svg.ts`, `src/lib/chart.ts`, `src/lib/projects.ts`, `tests/chart.test.ts`

**Interfaces:**
- `starChartSvg(points: [string, number][], opts: { paint: Paint; width: number; title: string }): string` — `type Paint = 'tomato'|'marigold'|'mint'|'sky'|'lilac'|'pink'`; width clamped 320–1200, height = round(width × 0.42); escapes the title; includes `<title>` and `role="img"`; fixed hex values for the paints (SVG in READMEs can't read CSS variables).
- `parseChartParams(url: URL): { paint: Paint; width: number }` — defaults `tomato`, 640; unknown → default.
- Chart route: `Cache-Control: public, max-age=3600, s-maxage=86400`, `content-type: image/svg+xml`, 404 SVG-less for unknown repos.
- `getProjectPage(db, owner, repo)` → project, products replaced, gaps partly met (`existing_repos` contains it), similar projects (share ≥ 2 topics, top 6 by stars), issues, users count, `indexable`.
- The page shows "Put this chart in your README" with a paint picker and the snippet `[![Star history on Antipaywall](https://www.antipaywall.org/chart/OWNER/REPO.svg?paint=PAINT)](https://www.antipaywall.org/projects/OWNER/REPO)`.

- [ ] **Step 1: Tests** — `starChartSvg` with 2 points returns a string starting `<svg` containing `role="img"` and the escaped title `a &lt;b&gt;`; width 5000 clamps to 1200; `parseChartParams(new URL('https://x/c?paint=blue&w=10'))` → `{paint:'tomato', width:320}`; one point (no history) still renders a flat line.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Page sets `noindex` when `!indexable`.
- [ ] **Step 6: Commit** `feat: project profiles and an embeddable star-history chart`

### Task 11: Topic pages

**Files:**
- Create: `src/pages/topics/index.astro`, `src/pages/topics/[slug].astro`, `src/lib/topics.ts`, `tests/topics.test.ts`

**Interfaces:**
- `getTopicPage(db, slug, sort: 'stars'|'growth'|'active')` → topic, projects (listed, having the topic), products whose `topics` include it, gaps attached to those products; `growth` = stars gained over the last 30 days from `star_points`/snapshots.
- `starsGained(points: [string, number][], days: number, now: Date): number`.
- Untracked topics with ≥ 5 listed projects also get a page (name = slug with dashes as spaces, capitalized), `noindex` until tracked.

- [ ] **Step 1: Tests** — `starsGained([['2026-10-01',100],['2026-11-12',160]], 30, new Date('2026-11-12'))` → between 40 and 60 (interpolated), never negative.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5: Commit** `feat: topic pages that gather projects, paid products and gaps`

### Task 12: Person pages (fills PR #7's slots)

Starts only after Ethan merges PR #7 into `feat/platform` (`git pull`). If it isn't merged when Tasks 1–11 and 13–14 are done, ask.

**Files:**
- Modify: `src/components/person/PersonStats.astro`, `src/components/person/PersonWants.astro`, `src/pages/builders/[...slug].astro` (OR `isBacker` into the backer badge at the marked comment)
- Create: `src/pages/people/[id].astro`, `src/lib/personWants.ts`, `tests/personWants.test.ts`

**Interfaces:**
- `personStats(db, userId): Promise<{ backed: number; payMonthCents: number; tested: number; savedMonthCents: number }>` — backed = distinct gaps hearted + products/projects signalled; saved = sum of `price` (normalized to month; `year`/12, `once` excluded) of products with a `use` signal.
- `personWants(db, userId): Promise<{ title: string; href: string; status: 'switched'|'building'|'wanted'; note: string }[]>` — product with `use` → switched; gap with `build_status='building'` or claims → building; else wanted.
- `/people/[id]`: email backer page (public only if `backers.public`; else 404); redirects to `/builders/<handle>` when a `people` row exists for that id.

- [ ] **Step 1: Tests** — `monthlyCents({cents: 12000, period: 'year'})` → 1000; `once` → 0; status mapping for the three cases.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5: Commit** `feat: person pages show what someone wants, backs and saves`

### Task 13: Home, navigation and the season page

**Files:**
- Modify: `src/pages/index.astro` (becomes the directory home), `src/components/SiteHeader.astro` (nav: Find `/`, Wanted `/ideas`, Hackathon `/hackathon`, People `/builders`; keep About, Pool, Rules, Sponsor, Join, Questions in "more")
- Create: `src/pages/hackathon.astro` (the current home's hackathon content, moved), `src/pages/seasons/[id].astro` (`/seasons/1` → 301 `/hackathon`), `src/lib/seasons.ts`, `src/components/SeasonBanner.astro`, `tests/seasons.test.ts`
- Modify: `src/styles/home.css` only to remove rules nothing uses after the move

**Interfaces:**
- `getSeason(db, id = 1): Promise<{ id; name; status; builders: number; needed: 100; pledgedCents: number; briefs: { slug: string; title: string; want: number; pay: number }[]; frozen: boolean; building: BuilderTile[] }>` — briefs from `season_briefs` when status ≠ 'collecting', else the top 5 listed unmerged gaps by `gap_demand.want`.
- `PRIZES = [30, 18, 12, 5, 5, 5, 5, 5, 5]` percent plus `communityChoicePercent: 10`; test that they sum to 100 with community choice.
- Home: search form → `/search`; product grid (top 12 by `use+switch+pay` then free-option count) with "N free options"; "Wanted, but nobody has built it" (top 6 gaps by gap score); "How it keeps growing" (Find, Signal, Contribute, Build); `SeasonBanner` large, near the top, with builder progress and Join.
- `Base.astro` default description becomes "Find the free, open-source version of anything you pay for, and see what's still missing."

- [ ] **Step 1: Tests** — prizes sum; `getSeason` with a fake db and status `collecting` returns top gaps; with `open` returns `season_briefs` order.
- [ ] **Step 2–4:** FAIL → implement → PASS. Existing `tests/pages.test.ts` still PASS.
- [ ] **Step 5: Commit** `feat: the home page finds free alternatives; the hackathon moves to its season page`

### Task 14: Open data, sitemap, SEO, and `pnpm match`

**Files:**
- Create: `src/pages/open-data/[file].json.ts` (`products`, `topics`, `projects`, `gaps`, `merges`), `scripts/match/index.ts`, `scripts/match/prompts/*.md`, `CONTRIBUTING.md`, `tests/opendata.test.ts`
- Modify: `src/pages/sitemap.xml.ts`, `package.json` (`"match": "tsx scripts/match/index.ts"`)

**Interfaces:**
- `publicGap(row): { slug; title; pitch; missing; want; build_status; merged_into_slug; products: string[] }` — no author, no ids of people, no visitor ids.
- Open data responses: `Cache-Control: public, s-maxage=3600`, `{ license: 'CC0-1.0', generated_at, items }`.
- `pnpm match`: reads `https://www.antipaywall.org/open-data/*.json` (or `--base` for a preview), with `ANTHROPIC_API_KEY` calls Claude (model `claude-haiku-5-5`) per task in `prompts/` and writes `catalog/` changes; without a key, writes `match-bundle.md` for Claude Code. Never writes the database.
- Sitemap: home, `/free-alternatives/*`, `/topics/*` (tracked), indexable projects, listed unmerged gaps, `/hackathon`, existing static pages.

- [ ] **Step 1: Tests** — `publicGap` output has no key named `author`, `author_id`, `backer_id`, `visitor` or `user_id`; sitemap builder excludes a project with `indexable=false`.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5: Commit** `feat: open data, sitemap, and the contributor matching tool`

### Task 15: Verify on the Vercel preview and open the PR

- [ ] `pnpm test` and `pnpm check` → PASS; `pnpm build` → OK.
- [ ] Push `feat/platform`; wait for the Vercel preview; on it, check: home, a product page (signal on/off, counts), a project page and its chart URL, a topic page, a gap page (me too, claim, follow), posting a test gap titled "Test gap from preview" then deleting it from admin (it's real data: tell Ethan it was created and removed), email sign-in to e@ethanplus.ai, search with a nonsense query, `/hackathon`, a builder profile with the two filled slots, `/open-data/products.json`, `/sitemap.xml`. Phone width on home and a product page.
- [ ] Final whole-branch review by a fresh reviewer; fix findings.
- [ ] `gh pr create --base main` summarizing the feature and the verification; end with the "Waiting on your merge" list.
