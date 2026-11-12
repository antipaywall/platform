-- Sponsors shown on the site. Added and edited only by the organizer.
-- `status` says whether the money has actually arrived: a sponsor that has only
-- promised is shown as "pledged", never as "paid".
create table public.sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  url text check (url is null or url ~ '^https://'),
  logo_url text check (logo_url is null or logo_url ~ '^https://'),
  amount_cents int not null check (amount_cents > 0),
  kind text not null check (kind in ('pool', 'bounty')),
  status text not null check (status in ('pledged', 'paid')),
  note text not null default '' check (char_length(note) <= 200),
  listed boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.sponsors enable row level security;
revoke all on public.sponsors from anon, authenticated;
