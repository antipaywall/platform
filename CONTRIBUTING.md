# Contributing to Antipaywall

Antipaywall is meant to be carried by the people who use it. Everything that decides what the
site shows is in this repository or in its public data, so you can change it the same way you
would change any open-source project: with a pull request.

## Run it yourself

`docs/run-locally.md` walks through running the whole platform on your own machine from the open data.

## The catalog

`catalog/` holds the paid products, the GitHub topics we track, hand-made links between projects
and products, gap merges, and the blocklist. `catalog/README.md` explains each file. A merged
change reaches the site on the next daily sync.

Good first contributions:

- Add a paid product people complain about paying for (`catalog/products/<slug>.yml`).
- Give a product better plain words, so wishes that don't name it still find it.
- Link a project the sync missed, or unlink a wrong match (`catalog/links.yml`).
- Propose that two wishes are the same (`catalog/merges.yml`).

## Matching with Claude, on your own key

`pnpm match` asks Claude to propose merges of duplicate wishes and better words for products. It
reads the site's public data, checks every proposal against the rules in `src/lib/matchProposals.ts`,
and writes changes to `catalog/`. It never touches the live site, and the site itself never calls
an AI model: whoever runs the matcher pays for their own run.

```bash
ANTHROPIC_API_KEY=... pnpm match
pnpm match --bundle      # no key: writes a file to paste into Claude Code instead
```

Then read the diff, run `pnpm test`, and open a pull request with what changed and why.

## The GitHub sync

`pnpm sync` copies the catalog into a database and pulls matching public repos from GitHub. You can
run it against your own Supabase project (`supabase/migrations/` creates the tables). Production runs
it daily in GitHub Actions (`.github/workflows/sync.yml`); the run log is public.

## Rules that don't bend

- Free to use, free to enter. No paywalls on Antipaywall.
- Signals are never money, and the site never implies anyone was charged.
- Antipaywall links to projects. It doesn't host, fork or rebrand them.
- Open-source projects and wishes only: never pirated copies, cracks or cheats.
- Public GitHub data only. Respect rate limits.
- Plain language a bakery owner would understand.
