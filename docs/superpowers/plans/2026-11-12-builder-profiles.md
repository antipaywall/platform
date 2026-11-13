# Builder profiles and accounts: implementation plan

**Goal:** ship the approved design in one PR on `feat/builder-profiles`, reviewed on the Vercel preview.
**Spec:** docs/superpowers/specs/2026-11-12-builder-profiles-design.md
**Execution:** native (in this session), then one review of the whole branch.

## Tasks
1. **Migration 0016_profiles.sql** — `people` gains `name`, `bio`, `location`, `repo_count`, `about`
   (≤400), `skills text[]` (≤8, each ≤30), `open_to_team`, `team_note` (≤140), `profile_public`,
   `featured_repos text[]` (≤6), `repos jsonb`, `repos_fetched_at`. A unique index on
   `(provider, lower(handle))`.
2. **Provider details and repos** — `fetchGithubFacts`/`fetchGitlabFacts` also return name, bio,
   location, repo count. New `src/lib/repos.ts`: `fetchRepos(provider, handle|id)` and
   `pickFeatured(repos, featured)`; tests with mocked fetch.
3. **Profile parsing** — `parseAccountProfile` in `forms.ts` (about, skills, X, website, team note,
   public switch); `parseFeatured`. Tests for limits and bad input.
4. **Data access** — `getProfile(provider, handle)`, `listBuilders` with provider/x/site, home list
   of newest 12, `refreshReposIfStale`.
5. **Pages** — `/builders` tiles, `/builders/[...slug]` profile, home section, `/account`,
   header menu, footer fix. Routes: `POST /api/account/profile`, `POST /api/account/repos`,
   `POST /api/account/delete`.
6. **Copy** — terms, privacy, and the sitemap lists builder profiles.
7. **Verify** — tsc, astro check, tests, local browser pass at desktop and phone width, then the
   preview.
