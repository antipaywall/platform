# The Antipaywall catalog

These files decide what the directory at antipaywall.org shows. Anyone can change them with a
pull request. The daily sync copies them into the site's database, so a merged change appears
on the site after the next sync.

| File | What it holds |
|---|---|
| `products/<slug>.yml` | One paid product per file: name, category, price, the plain words people use for the job, the GitHub topics and search terms that find its open-source alternatives |
| `topics.yml` | GitHub topics with a page of their own, each with a plain-words name and one sentence |
| `links.yml` | A project linked to, or unlinked from, a paid product by hand, with a reason |
| `merges.yml` | Gaps (wishes) that are the same wish, with a reason |
| `blocklist.yml` | Repos and words that never reach the site (piracy, cracks, cheats) |
| `research/` | The data the first products were picked from, so anyone can rerun or challenge it |

## Add a paid product

Create `products/<slug>.yml`. The file name must be the slug.

```yaml
slug: calendly
name: Calendly
category: Scheduling          # one of the categories in src/lib/catalog.ts
price: { cents: 1000, period: month }   # the lowest public paid price
blurb: Booking links so people can pick a time to meet you.
words: [booking, appointments, scheduling, meeting link, availability, deposit]
topics: [scheduling, booking, calendar]
search_terms: [calendly alternative, appointment booking]
aliases: [calendly.com]
excludes: []                  # owner/repo of matches that are wrong
```

`words` matter most: they are how a wish that never names the product still finds it. Use the
words a person who doesn't write code would use.

## Rules

- Antipaywall lists open-source projects and wishes. Never pirated copies, cracks or cheats.
- Nothing here costs anyone money to run. `pnpm match` runs Claude on your own key and only
  writes changes to these files; it never touches the live site.
