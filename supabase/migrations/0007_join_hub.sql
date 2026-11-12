-- Joining becomes five separate things, each stored for what it is:
--   the email list, panel applications, offers to help organize, sponsor inquiries,
--   and (already in `people`) builders.
-- The old catch-all `interest` table is replaced. It held no rows when this ran.
-- Every table is server-only, like the rest.

drop function public.save_interest(text, text[], text, text, text, int);
drop function public.interest_summary();
drop table public.interest;

-- The email list. One row per address. An unsubscribed row is kept so the
-- address is never emailed and never quietly added back.
create table public.subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and char_length(email) between 5 and 254),
  -- 'form': typed into the site. 'github': the address GitHub gave when the person signed in.
  source text not null check (source in ('form', 'github')),
  person_id uuid references public.people (id) on delete set null,
  -- The secret in the unsubscribe link. Knowing it is what lets someone unsubscribe.
  token uuid not null unique default gen_random_uuid(),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  -- The one-day visitor code, kept only to slow down scripts adding addresses.
  sender text,
  subscribed_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  welcomed_at timestamptz
);
create index subscribers_sender_idx on public.subscribers (sender, subscribed_at);
create index subscribers_person_idx on public.subscribers (person_id);

-- Someone signed in who would sit on the review panel.
create table public.panel_applications (
  person_id uuid primary key references public.people (id) on delete cascade,
  why text not null check (char_length(why) between 1 and 500),
  ties text not null default '' check (char_length(ties) <= 500),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  handled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Someone signed in who offered to help run it.
create table public.organize_offers (
  person_id uuid primary key references public.people (id) on delete cascade,
  note text not null check (char_length(note) between 1 and 500),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  handled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A company asking about sponsoring. No account needed.
create table public.sponsor_inquiries (
  id uuid primary key default gen_random_uuid(),
  company text not null check (char_length(company) between 1 and 120),
  contact_name text not null check (char_length(contact_name) between 1 and 120),
  email text not null check (email = lower(email) and char_length(email) between 5 and 254),
  amount_usd int check (amount_usd is null or amount_usd between 1 and 10000000),
  kind text not null check (kind in ('pool', 'bounty', 'unsure')),
  message text not null default '' check (char_length(message) <= 1000),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  sender text not null,
  handled boolean not null default false,
  created_at timestamptz not null default now()
);
create index sponsor_inquiries_sender_idx on public.sponsor_inquiries (sender, created_at);

do $$
declare t text;
begin
  foreach t in array array['subscribers', 'panel_applications', 'organize_offers', 'sponsor_inquiries'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Adds an address to the list. Returns its state and unsubscribe token:
--   'new'           added just now (the caller sends the welcome email)
--   'existing'      already on the list
--   'unsubscribed'  this address unsubscribed before, and stays that way.
--                   Only its own unsubscribe link can bring it back.
--   'limited'       this sender has added too many addresses in the last hour; nothing saved
create function public.subscribe(
  p_email text, p_source text, p_person uuid, p_country text, p_sender text, p_max_per_hour int
) returns json
language plpgsql security invoker set search_path = ''
as $$
declare r public.subscribers;
begin
  select * into r from public.subscribers where email = p_email;
  if found then
    if p_person is not null and r.person_id is null then
      update public.subscribers set person_id = p_person where id = r.id;
    end if;
    return json_build_object(
      'status', case when r.unsubscribed_at is null then 'existing' else 'unsubscribed' end,
      'token', r.token);
  end if;
  if p_source = 'form' and (
    select count(*) from public.subscribers
     where sender = p_sender and subscribed_at > now() - interval '1 hour') >= p_max_per_hour then
    return json_build_object('status', 'limited');
  end if;
  insert into public.subscribers (email, source, person_id, country, sender)
  values (p_email, p_source, p_person, p_country, p_sender)
  returning * into r;
  return json_build_object('status', 'new', 'token', r.token);
end;
$$;

-- Returns true when the token matched a row. Unsubscribing twice changes nothing.
create function public.unsubscribe(p_token uuid) returns boolean
language plpgsql security invoker set search_path = ''
as $$
begin
  update public.subscribers set unsubscribed_at = coalesce(unsubscribed_at, now()) where token = p_token;
  return found;
end;
$$;

-- The way back, for someone holding their own link.
create function public.resubscribe(p_token uuid) returns boolean
language plpgsql security invoker set search_path = ''
as $$
begin
  update public.subscribers set unsubscribed_at = null where token = p_token;
  return found;
end;
$$;

-- Saves a sponsor inquiry. Returns false, saving nothing, when the same sender
-- has already sent too many in the last hour.
create function public.save_sponsor_inquiry(
  p_company text, p_contact text, p_email text, p_amount int, p_kind text, p_message text,
  p_country text, p_sender text, p_max_per_hour int
) returns boolean
language plpgsql security invoker set search_path = ''
as $$
begin
  if (select count(*) from public.sponsor_inquiries
       where sender = p_sender and created_at > now() - interval '1 hour') >= p_max_per_hour then
    return false;
  end if;
  insert into public.sponsor_inquiries (company, contact_name, email, amount_usd, kind, message, country, sender)
  values (p_company, p_contact, p_email, p_amount, p_kind, p_message, p_country, p_sender);
  return true;
end;
$$;

-- Counts for the organizer's page. No addresses.
create function public.list_summary() returns json
language sql stable security invoker set search_path = ''
as $$
  select json_build_object(
    'active', (select count(*) from public.subscribers where unsubscribed_at is null),
    'unsubscribed', (select count(*) from public.subscribers where unsubscribed_at is not null),
    'sources', (select coalesce(json_agg(t), '[]'::json) from (
      select source as label, count(*) as people from public.subscribers
       where unsubscribed_at is null group by 1 order by people desc, 1) t),
    'countries', (select coalesce(json_agg(t), '[]'::json) from (
      select coalesce(country, 'unknown') as label, count(*) as people from public.subscribers
       where unsubscribed_at is null group by 1 order by people desc, 1 limit 40) t)
  );
$$;

revoke execute on function public.subscribe(text, text, uuid, text, text, int) from public, anon, authenticated;
revoke execute on function public.unsubscribe(uuid) from public, anon, authenticated;
revoke execute on function public.resubscribe(uuid) from public, anon, authenticated;
revoke execute on function public.save_sponsor_inquiry(text, text, text, int, text, text, text, text, int) from public, anon, authenticated;
revoke execute on function public.list_summary() from public, anon, authenticated;
grant execute on function public.subscribe(text, text, uuid, text, text, int) to service_role;
grant execute on function public.unsubscribe(uuid) to service_role;
grant execute on function public.resubscribe(uuid) to service_role;
grant execute on function public.save_sponsor_inquiry(text, text, text, int, text, text, text, text, int) to service_role;
grant execute on function public.list_summary() to service_role;
