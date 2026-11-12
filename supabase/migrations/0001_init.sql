-- Antipaywall launch schema.
-- Every table has row-level security on and no policies: browsers can read and
-- write nothing directly. The site's server reads and writes with the secret key
-- and decides what is public.

create table public.people (
  id uuid primary key references auth.users (id) on delete cascade,
  github_id bigint unique not null,
  handle text not null,
  avatar_url text,
  account_created_at timestamptz,
  repos_before_announce int,
  contributions_12mo int,
  verified boolean not null default false,
  failed_rules text[] not null default '{}',
  checked_at timestamptz,
  is_builder boolean not null default false,
  x_handle text,
  site_url text,
  email text,
  rules_version text,
  rules_accepted_at timestamptz,
  joined_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null check (char_length(title) between 3 and 80),
  pitch text not null default '' check (char_length(pitch) <= 280),
  missing text not null default '' check (char_length(missing) <= 600),
  existing_repos jsonb not null default '[]'::jsonb,
  author_id uuid not null references public.people (id) on delete cascade,
  status text not null default 'listed' check (status in ('listed', 'hidden')),
  created_at timestamptz not null default now()
);
create index ideas_author_idx on public.ideas (author_id);

create table public.idea_follows (
  idea_id uuid not null references public.ideas (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (idea_id, person_id)
);
create index idea_follows_person_idx on public.idea_follows (person_id);

-- A pledge is a public promise, never money. idea_id null means the main pool.
create table public.pledges (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  idea_id uuid references public.ideas (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  amount_cents int not null check (amount_cents > 0),
  status text not null check (status in ('held', 'listed', 'hidden', 'fulfilled')),
  fulfilled_ledger_id text,
  created_at timestamptz not null default now()
);
create index pledges_idea_idx on public.pledges (idea_id);
-- One open pledge per person per target; a new one replaces the old.
create unique index pledges_one_open on public.pledges
  (person_id, coalesce(idea_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status in ('held', 'listed');

-- Copied from the Open Collective ledger by the sync job. Never typed by hand.
create table public.contributions (
  ledger_id text primary key,
  from_slug text,
  from_name text not null,
  from_type text not null,
  from_image_url text,
  incognito boolean not null default false,
  amount_cents int not null,
  net_cents int not null,
  currency text not null,
  created_at timestamptz not null,
  ledger_url text not null,
  refunded boolean not null default false
);

create table public.payouts (
  ledger_id text primary key,
  to_name text not null,
  description text not null default '',
  amount_cents int not null,
  created_at timestamptz not null,
  ledger_url text not null
);

create table public.pool_snapshot (
  id int primary key check (id = 1),
  balance_cents int not null,
  currency text not null,
  synced_at timestamptz not null
);

create table public.sync_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  error text
);

create table public.panel_applications (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null unique references public.people (id) on delete cascade,
  x_handle text,
  background text not null check (char_length(background) <= 500),
  conflicts text not null default '' check (char_length(conflicts) <= 500),
  status text not null default 'applied',
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array[
    'people', 'ideas', 'idea_follows', 'pledges', 'contributions',
    'payouts', 'pool_snapshot', 'sync_runs', 'panel_applications'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
