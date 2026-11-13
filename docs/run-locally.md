# Run Antipaywall yourself

Everything that decides what antipaywall.org shows is open: this code, the catalog in `catalog/`, the
ideas in the [antipaywall/ideas](https://github.com/antipaywall/ideas) repo, and the public data at
`/open-data/*.json`. With those, anyone can run the whole platform on their own machine, or carry it on
without us. Nothing private from the live site is needed.

## What you need

- Node 22 and pnpm 10
- The [Supabase CLI](https://supabase.com/docs/guides/cli) and Docker (for a local database; about 2 GB of images the first time)
- A GitHub account (for signing in, and a free token for the sync)

## Steps

1. **Get the code and install.**

   ```bash
   git clone https://github.com/antipaywall/platform && cd platform
   pnpm install
   ```

2. **Start a local database and create the tables.**

   ```bash
   supabase init
   supabase start
   supabase db reset   # runs every file in supabase/migrations
   ```

   `supabase start` prints a local API URL and a service key. Put them in `.env` (copy `.env.example`):
   `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_KEY` (the anon key), `SUPABASE_SECRET_KEY` (the service key).

3. **Fill it from the open data.**

   ```bash
   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SECRET_KEY=<service key> pnpm local:seed
   ```

   This copies the paid products, topics, projects and gaps from the live site's open data. It refuses
   to write to anything but a local address.

4. **Run the site.**

   ```bash
   pnpm dev
   ```

   Open http://localhost:4610. Signing in needs a GitHub OAuth app of your own, set up in your local
   Supabase (Auth → Providers → GitHub).

5. **Keep it fresh from GitHub, like production does.**

   ```bash
   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SECRET_KEY=<service key> GITHUB_TOKEN=<a free token> pnpm sync
   ```

   The sync reads the catalog, searches GitHub, and fills projects, help-wanted issues and the daily
   star counts. It also re-reads the ideas repo.

## Improve it

- Change the catalog or the matching, and open a pull request. See `CONTRIBUTING.md`.
- `pnpm match` asks Claude, on your own key, to propose better matches as catalog changes.
- Suggest improvements to ideas on the site, or open pull requests on the ideas repo directly.
