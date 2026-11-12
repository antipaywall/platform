-- Rate limiting moves to its own small table, so it no longer rides on the rows it protects.
-- Each row is "this key did this kind of thing at this time": no email address, no page, no
-- account. The key for a visitor is a keyed hash of the day and the IP address, made with a
-- different context from the page-view visitor code, so the two can never be matched up.
-- Rows older than a day are deleted every time a slot is taken.
create table public.rate_events (
  id bigint generated always as identity primary key,
  kind text not null check (char_length(kind) between 1 and 40),
  key text not null check (char_length(key) between 1 and 80),
  created_at timestamptz not null default now()
);
create index rate_events_lookup_idx on public.rate_events (kind, key, created_at);
alter table public.rate_events enable row level security;
revoke all on public.rate_events from anon, authenticated;

-- Takes one slot for (kind, key) if fewer than p_max were taken in the last p_minutes.
-- Returns false, recording nothing, when the limit is reached. The check and the insert
-- happen under a lock on the pair, so two requests at once cannot both take the last slot.
create function public.take_slot(p_kind text, p_key text, p_max int, p_minutes int default 60) returns boolean
language plpgsql security invoker set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_kind || ':' || p_key, 0));
  delete from public.rate_events where created_at < now() - interval '1 day';
  if (select count(*) from public.rate_events
       where kind = p_kind and key = p_key
         and created_at > now() - make_interval(mins => p_minutes)) >= p_max then
    return false;
  end if;
  insert into public.rate_events (kind, key) values (p_kind, p_key);
  return true;
end;
$$;

revoke execute on function public.take_slot(text, text, int, int) from public, anon, authenticated;
grant execute on function public.take_slot(text, text, int, int) to service_role;

-- The old per-row sender codes were made with the same key and context as the page-view
-- visitor code, so an email address could in principle be matched to that day's page views.
-- They are no longer written. Clear the ones already stored.
-- (`subscribers.sender` and `sponsor_inquiries.sender` are left in place, unused, so the
-- previous version of the site keeps working while this one is rolled out.)
update public.subscribers set sender = null where sender is not null;
update public.sponsor_inquiries set sender = '-' where sender <> '-';
