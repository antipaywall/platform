-- Paid tools people looked up by pasting the tool's website. The site reads the homepage once
-- (no AI model), searches GitHub with the tool's own words, and keeps what it found here so the
-- next person asking gets an answer at once. `askers` counts each browser or account once: it is
-- how the site learns which paid tools people want replaced. Additive: nothing else changes.

create table public.asked_tools (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique check (char_length(domain) <= 100 and domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$'),
  name text not null check (char_length(name) between 1 and 60),
  tagline text not null default '' check (char_length(tagline) <= 160),
  description text not null default '' check (char_length(description) <= 320),
  price_cents int check (price_cents is null or price_cents >= 0),
  price_period text check (price_period in ('month', 'year')),
  words text[] not null default '{}',
  phrases text[] not null default '{}',
  -- The closest open-source projects found, as [{fullName, url, description, stars, license}].
  repos jsonb not null default '[]'::jsonb check (jsonb_typeof(repos) = 'array'),
  best_stars int not null default 0,
  -- One entry per browser or account that asked, so a count is people, not page loads.
  askers text[] not null default '{}',
  -- 'new' pages are reachable by their address but never listed or indexed; an organizer lists or hides them.
  status text not null default 'new' check (status in ('new', 'listed', 'hidden')),
  -- False when the website could not be read and only its address is known.
  read_ok boolean not null default true,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index asked_tools_words on public.asked_tools using gin (words);

alter table public.asked_tools enable row level security;
revoke all on public.asked_tools from anon, authenticated;
