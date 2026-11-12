# Antipaywall platform

The site for [Antipaywall](https://www.antipaywall.org), a free, one-week open-source
hackathon: build the free version of something people overpay for.

The code is public so that the site's claims can be checked against it: who qualifies
as a builder, what is in the pool, and what is only pledged. This README says plainly
what the site does today and what it does not do yet.

## What the site does today

- **Join.** `/join` offers five ways in: follow along, build, sit on the review panel,
  help organize, sponsor (`src/lib/ways.ts`).
- **Build.** `/join/build`: sign in with GitHub. Two automatic checks decide whether
  an account counts as a verified builder (`src/lib/eligibility.ts`).
- **Ideas.** Anyone signed in can post something that should be free, up to five each.
  When an idea is posted, the server searches GitHub for open-source projects that
  already do it and saves that list itself (`src/lib/postIdea.ts`, `src/lib/github.ts`).
  The organizer can also post an idea with no personal author; it is shown as "Posted
  by Antipaywall" and counts toward nobody's limit (`src/pages/api/admin/idea.ts`).
- **Hearts.** Anyone can heart an idea without an account: one per browser per idea,
  keyed by a random id in a cookie (`src/pages/api/heart.ts`). Hearts can be gamed by
  clearing cookies. They are an interest signal only and carry no money and no weight
  in any prize.
- **Pledges.** A pledge is a public promise to the prize pool, not a payment. Each
  is from an individual or a company, shows the pledger's GitHub handle (verified by
  sign-in), and can carry an X username and, for a company, a website. Those two, and
  the display name, are whatever the pledger typed, so a pledge is listed straight
  away only when nothing on it could pass for someone else: it is from an individual,
  is $1,000 or less, has no X username, and its display name is the pledger's own
  GitHub handle. Every other pledge waits for the organizer to check it. The form
  says so before it is sent (`parsePledge` in `src/lib/forms.ts`,
  `src/pages/api/pledge.ts`, `src/components/PledgeForm.astro`).
- **Pool.** The pool total is read from the `pool_snapshot` table, which only the
  ledger sync will write. Until the pool opens it is empty and reads $0.
- **Sponsors.** Added and edited only by the organizer. Each is shown with its amount
  and whether the money is pledged or paid, exactly as stored. These are the one set
  of figures on the site that a person enters, and the sponsor list says so. Links
  and logos must be https (`parseSponsor` in `src/lib/forms.ts`). With none, the
  homepage shows the spots as open.
- **The organizer's own pledge** is read from his pledge row like anyone else's
  (`getOrganizerPledge` in `src/lib/db.ts`). If there is none, the site says nothing
  about it.
- **Page-view counts.** First-party, with no cookie and no outside service. Per view:
  the day and time, the page path, a two-letter country, the referring host, the tags
  on the link (`ref` or `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`), the
  kind of device (phone, tablet or computer) and a visitor hash that is only good for
  that day. The IP address and browser name are used to compute the hash and the
  device kind and are not stored (`src/lib/analytics.ts`, `src/middleware.ts`).
  A view is recorded only on the production deployment, with a country reported by
  the host, for a browser navigating to a public page (a GET asking for HTML with an
  `Accept-Language` header and, where sent, `Sec-Fetch-Dest: document` and
  `Sec-Fetch-Mode: navigate`). Crawlers, scripts, headless browsers, link previews,
  uptime checks, prefetches and signed-in organizers are not counted. Local and
  preview deployments record nothing.
- **Actions, and how they are linked to a visit.** Signing in, the builder checks,
  joining as a builder, joining or leaving the email list, pledging, posting or
  hearting an idea, applying to the panel, offering to organize and sending a sponsor
  inquiry are each recorded as a row in `events`: the time, the kind, a reference (an
  account id, an idea's slug, or a row id; never an email address or free text, which
  a database check enforces), a country, and the same one-day visitor hash a page view
  gets (`src/lib/events.ts`). Rows with the same day and hash came from the same
  browser on the same network on the same day, which is how the organizer sees where
  a sign-up came from and which pages it viewed. No cookie or browser storage is
  involved, and nothing can be followed across days. A failed write never fails the
  action. The organizer's own actions and a mail app's one-click unsubscribe carry no
  hash. The form rate limiter still uses its own, unrelated key (`src/lib/ratelimit.ts`).
- **Organizer pages** under `/admin`, for the GitHub ids in `ADMIN_GITHUB_IDS` only.
  Everyone else gets a 404 from every page and from every route under `/api/admin/`,
  each of which checks before doing anything else; the links to them are not rendered
  for anyone else; and responses are sent `private, no-store` and `noindex`
  (`src/lib/admin.ts`, `tests/admin.test.ts`).
  - `/admin`: visitors, views and sign-ups for today, yesterday, 7 and 30 days; what
    people did; hourly and daily charts; sources with conversion; landing pages,
    pages, countries and devices.
  - `/admin/visitors`: each visitor-day with its source, landing page, pages in order
    and actions.
  - `/admin/people`: everyone who signed up for anything, once each, with what they
    signed up for and the visit behind it; filter, search and CSV export.
  - `/admin/manage`: the email list, panel applications, offers to help, sponsor
    inquiries, moderation and sponsors.

  The numbers are computed in the database
  (`supabase/migrations/0013_attribution.sql`). A source is the tag on the link
  (`?ref=x`) if there is one, otherwise the referring site, otherwise "direct";
  well-known tags and sites are grouped (`src/lib/sources.ts`). Visitor-days that look
  like a program (three or more pages under a second apart; a single view straight
  onto an inner page with no referrer and no tag; a same-minute burst of single
  homepage views from one country) are marked "possibly automated". They are shown,
  never deleted, and are only left out of the numbers when the organizer asks.
- **Privacy page** at `/privacy` lists what is recorded. It is written from the code
  and should be changed in the same commit as any change to what is collected.
- **Totals** are computed in the database (`supabase/migrations/0002_totals_and_safety.sql`).
  If the database can't be read, pages say the numbers are unavailable rather than
  showing a zero.

- **Email list.** One table of addresses (`supabase/migrations/0007_join_hub.sql`).
  An address joins by being typed into `/join`, or by signing in with GitHub, which
  the sign-in button says before the click (`src/components/SignIn.astro`,
  `src/lib/list.ts`). Addresses typed into the site are not confirmed, are never
  linked to an account, and get the same answer whether or not they were already
  listed. Every email to the list carries an unsubscribe link. Opening it changes
  nothing: the page shows which address it is for and a button that posts
  (`/unsubscribe`, `src/pages/api/unsubscribe.ts`). Mail apps get true one-click
  unsubscribe through `List-Unsubscribe-Post` (`src/pages/api/list-unsubscribe.ts`).
  An unsubscribed address is kept, marked, and is not added back by the form or by
  signing in: only its own link can do that (`subscribe` in the migration).
- **Panel applications and offers to help organize.** Signed-in people only
  (`/join/panel`, `/join/organize`). What they write is stored for the organizer and
  not published.
- **Sponsor inquiries.** A form on `/sponsor` with no account. Stored for the
  organizer; the address is not added to the email list.
- **Email.** Sent through Resend when `RESEND_API_KEY` is set, and not at all when it
  is not (`src/lib/email.ts`). Two kinds exist: a welcome to a new subscriber, and a
  notice to the organizer for each inquiry, application or offer. A failed send
  never fails the request that caused it.
- **Limits.** A hidden trap field on the forms that need no account, and hourly caps
  enforced in the database before anything else is looked up
  (`src/lib/ratelimit.ts`, `supabase/migrations/0010_rate_events.sql`): five list
  sign-ups and three sponsor inquiries per connection, five panel or organize
  submissions per person, and 60 outgoing emails for the whole site. A connection is
  a one-day keyed hash of the IP address alone, made separately from the page-view
  hash, so changing browser does not reset it; changing network does. When the email
  cap is reached the submission is still saved and the email is skipped. The
  records are deleted after a day.
- **CSV export** of the email list, for the organizer only. Each row carries that
  address's unsubscribe link and whether it has unsubscribed. Cells that a
  spreadsheet would run as a formula are neutralised (`csvCell` in `src/lib/intake.ts`).
- **Sign-in.** Only a GitHub identity is accepted, and the account id is taken from
  the identity record and confirmed against GitHub's API, never from data the user
  can edit (`src/lib/identity.ts`, `src/pages/auth/callback.ts`). Session cookies are
  HttpOnly and, outside local http, Secure.
- **Cross-site requests.** Every write must carry this site's own `Origin`, with one
  exception by path for one-click unsubscribe (`src/lib/origin.ts`).
- **Content Security Policy**, set in `astro.config.mjs`: scripts from this site only,
  with hashes for the ones Astro inlines and no `unsafe-inline`; styles from this
  site and Fontshare, with `unsafe-inline` because pages use style attributes; fonts
  from Fontshare; images from any https address; forms post to this site only.

- **Rules and terms.** `/rules` shows a version and date and lists every change.
  `/terms` is written in plain language, has not yet been reviewed by a lawyer, and
  says so at the top.

## What is not built yet

Stated here so the site's claims can be checked against the code:

- The pool itself. It is not open and nobody can pay in. Our choice of holder is Open
  Source Collective; it is not confirmed yet.
- The sync that copies contributions and payouts from the holder's public record.
- Project submission, the automatic repository checks, voting and payouts.
- Listing sponsor bounties. The rules for them are written down (`bountyRules` in
  `src/config/site.ts`), but there is nothing to list or decide them with yet.
- Confirming an address before it joins the email list.
- Rules for organizers and the review panel building entries (`insiderRules` in
  `src/config/site.ts`) are written down but enforced by nothing: there are no
  entries or votes to enforce them on yet.
- Rate limits on the repo search that hold across server instances. Today's are per
  person and per instance.

## Who gets the money

Antipaywall takes nothing: no cut, no fee, no profit. The pool is not open yet. It will
be held by an independent nonprofit, never by Antipaywall or its organizer. Our choice
is Open Source Collective, which keeps 10% of each contribution for that service; we
are asking sponsors to cover that 10%. The holder and its fee are confirmed on the
site before anyone can pay in. The wording lives in one place (`money` in
`src/config/site.ts`).

## How it is put together

- [Astro](https://astro.build), rendered on the server, deployed on Vercel.
- Supabase for Postgres and GitHub sign-in.
- Every table has row-level security switched on with no policies, so a browser can
  read and write nothing directly. The server uses a secret key and decides what is
  shown (`supabase/migrations/`, `src/lib/supabase.ts`).
- Messages shown after an action are looked up from a fixed list by code, so a link
  cannot make the site display someone else's words (`src/lib/respond.ts`).
- Dates, thresholds, fees and names live in one file: `src/config/site.ts`.

## Fonts

Cabinet Grotesk and Satoshi are loaded from Fontshare's servers rather than stored in
this repository, because their licence terms on redistributing the font files were
not confirmed.

## Run it

```bash
pnpm install
```

Copy `.env.example` to `.env` and fill in your own Supabase project's values.

```bash
pnpm dev
```

The dev server runs on http://127.0.0.1:4610.

```bash
pnpm test
```

Page views are only recorded on the production deployment, so running the site
locally adds nothing to anyone's numbers.

## Reporting a problem

Found a bug, a security hole, or a claim on the site that the code does not back up?
Open an issue. For anything that could be abused before it is fixed, email
security@antipaywall.org instead.

## Licence

MIT. See `LICENSE`.
