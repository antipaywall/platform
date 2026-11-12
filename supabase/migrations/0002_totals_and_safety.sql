-- Totals are computed in the database, so they stay right past any row limit,
-- and a pledge is replaced in one transaction so a failure can never lose it.
-- Tables for features that are not built yet are removed until they are.

alter table public.people drop column email;
drop table public.panel_applications;
drop table public.sync_runs;
drop table public.payouts;
drop table public.contributions;

create view public.idea_totals with (security_invoker = true) as
select
  i.id, i.slug, i.title, i.pitch, i.missing, i.existing_repos, i.status, i.created_at,
  p.handle as author,
  (select count(*) from public.idea_follows f where f.idea_id = i.id)::int as followers,
  (select coalesce(sum(pl.amount_cents), 0) from public.pledges pl
     where pl.idea_id = i.id and pl.status = 'listed')::bigint as pledged_cents
from public.ideas i
join public.people p on p.id = i.author_id;

create function public.site_stats() returns json
language sql stable security invoker set search_path = ''
as $$
  select json_build_object(
    'balance_cents', (select balance_cents from public.pool_snapshot where id = 1),
    'synced_at', (select synced_at from public.pool_snapshot where id = 1),
    'builders', (select count(*) from public.people where is_builder),
    'pledged_cents', (select coalesce(sum(amount_cents), 0) from public.pledges where status = 'listed'),
    'ideas', (select count(*) from public.ideas where status = 'listed')
  );
$$;

-- Hides the person's open pledge on this target, if any, and records the new one.
create function public.replace_pledge(
  p_person uuid, p_idea uuid, p_name text, p_cents int, p_status text
) returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  update public.pledges set status = 'hidden'
   where person_id = p_person
     and status in ('held', 'listed')
     and idea_id is not distinct from p_idea;
  insert into public.pledges (person_id, idea_id, display_name, amount_cents, status)
  values (p_person, p_idea, p_name, p_cents, p_status);
end;
$$;

revoke all on public.idea_totals from anon, authenticated;
revoke execute on function public.site_stats() from public, anon, authenticated;
revoke execute on function public.replace_pledge(uuid, uuid, text, int, text) from public, anon, authenticated;
grant execute on function public.site_stats() to service_role;
grant execute on function public.replace_pledge(uuid, uuid, text, int, text) to service_role;
