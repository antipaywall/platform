-- Ideas show what people want. They no longer carry money or follows:
-- pledges go to the main pool only, and an idea collects hearts.
--
-- A heart needs no sign-in. It is one per browser per idea, keyed by a random
-- id kept in a cookie, so it can be gamed by clearing cookies. Hearts are an
-- interest signal only. They carry no money and no weight in any prize.

drop view public.idea_totals;
drop function public.replace_pledge(uuid, uuid, text, int, text);
drop table public.idea_follows;

drop index public.pledges_one_open;
drop index public.pledges_idea_idx;
alter table public.pledges drop column idea_id;
-- One open pledge per person; a new one replaces the old.
create unique index pledges_one_open on public.pledges (person_id) where status in ('held', 'listed');

create table public.idea_hearts (
  idea_id uuid not null references public.ideas (id) on delete cascade,
  visitor uuid not null,
  created_at timestamptz not null default now(),
  primary key (idea_id, visitor)
);
alter table public.idea_hearts enable row level security;
revoke all on public.idea_hearts from anon, authenticated;

create view public.idea_totals with (security_invoker = true) as
select
  i.id, i.slug, i.title, i.pitch, i.missing, i.existing_repos, i.status, i.created_at,
  p.handle as author,
  (select count(*) from public.idea_hearts h where h.idea_id = i.id)::int as hearts
from public.ideas i
join public.people p on p.id = i.author_id;

-- Hides the person's open pledge, if any, and records the new one, in one transaction.
create function public.replace_pledge(p_person uuid, p_name text, p_cents int, p_status text)
returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  update public.pledges set status = 'hidden'
   where person_id = p_person and status in ('held', 'listed');
  insert into public.pledges (person_id, display_name, amount_cents, status)
  values (p_person, p_name, p_cents, p_status);
end;
$$;

revoke all on public.idea_totals from anon, authenticated;
revoke execute on function public.replace_pledge(uuid, text, int, text) from public, anon, authenticated;
grant execute on function public.replace_pledge(uuid, text, int, text) to service_role;
