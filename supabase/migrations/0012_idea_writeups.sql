-- A longer write-up for an idea: the problem, what to build, what a strong entry does,
-- and an optional source link for any claim about another product. All optional.
-- The view keeps every existing column in the same order and adds the new ones at the end.

alter table public.ideas
  add column problem text not null default '' check (char_length(problem) <= 1200),
  add column build text not null default '' check (char_length(build) <= 1200),
  add column strong text not null default '' check (char_length(strong) <= 1200),
  add column source_url text check (source_url is null or (source_url ~ '^https://' and char_length(source_url) <= 300));

create or replace view public.idea_totals with (security_invoker = true) as
select
  i.id, i.slug, i.title, i.pitch, i.missing, i.existing_repos, i.status, i.created_at,
  coalesce(p.handle, 'antipaywall') as author,
  (select count(*) from public.idea_hearts h where h.idea_id = i.id)::int as hearts,
  (i.author_id is null) as by_platform,
  i.problem, i.build, i.strong, i.source_url
from public.ideas i
left join public.people p on p.id = i.author_id;

revoke all on public.idea_totals from anon, authenticated;
