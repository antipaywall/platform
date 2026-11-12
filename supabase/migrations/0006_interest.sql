-- People who want to help, from the form on /help. No account is needed, so this
-- is the one place the site stores an email address itself. Server-only, like
-- every other table.

create table public.interest (
  email text primary key check (email = lower(email) and char_length(email) between 5 and 254),
  roles text[] not null check (
    cardinality(roles) between 1 and 5
    and roles <@ array['follow', 'build', 'judge', 'organize', 'sponsor']
  ),
  note text not null default '' check (char_length(note) <= 500),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  -- The same one-day visitor code used for page-view counts. Kept only to slow down spam.
  sender text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index interest_sender_idx on public.interest (sender, updated_at);

alter table public.interest enable row level security;
revoke all on public.interest from anon, authenticated;

-- Saves or updates one person's answer. Returns false, saving nothing, when the
-- same sender has already submitted too many different addresses in the last hour.
create function public.save_interest(
  p_email text, p_roles text[], p_note text, p_country text, p_sender text, p_max_per_hour int
) returns boolean
language plpgsql security invoker set search_path = ''
as $$
begin
  if (select count(*) from public.interest
       where sender = p_sender and updated_at > now() - interval '1 hour' and email <> p_email) >= p_max_per_hour then
    return false;
  end if;
  insert into public.interest (email, roles, note, country, sender)
  values (p_email, p_roles, p_note, p_country, p_sender)
  on conflict (email) do update
    set roles = excluded.roles, note = excluded.note, country = excluded.country,
        sender = excluded.sender, updated_at = now();
  return true;
end;
$$;

-- Counts only. The addresses themselves are read separately, by the organizer's page.
create function public.interest_summary() returns json
language sql stable security invoker set search_path = ''
as $$
  select json_build_object(
    'total', (select count(*) from public.interest),
    'roles', (select coalesce(json_agg(t), '[]'::json) from (
      select r as label, count(*) as people from public.interest, unnest(roles) as r group by r order by people desc, r) t),
    'countries', (select coalesce(json_agg(t), '[]'::json) from (
      select coalesce(country, 'unknown') as label, count(*) as people from public.interest group by 1 order by people desc, 1 limit 40) t)
  );
$$;

revoke execute on function public.save_interest(text, text[], text, text, text, int) from public, anon, authenticated;
revoke execute on function public.interest_summary() from public, anon, authenticated;
grant execute on function public.save_interest(text, text[], text, text, text, int) to service_role;
grant execute on function public.interest_summary() to service_role;
