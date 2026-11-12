-- Ideas the platform posts itself have no personal author: author_id is null.
-- The view keeps every column the earlier code reads, in the same order, and adds one.
-- `author` falls back to the platform's name so nothing ever shows an empty handle.

alter table public.ideas alter column author_id drop not null;

create or replace view public.idea_totals with (security_invoker = true) as
select
  i.id, i.slug, i.title, i.pitch, i.missing, i.existing_repos, i.status, i.created_at,
  coalesce(p.handle, 'antipaywall') as author,
  (select count(*) from public.idea_hearts h where h.idea_id = i.id)::int as hearts,
  (i.author_id is null) as by_platform
from public.ideas i
left join public.people p on p.id = i.author_id;

revoke all on public.idea_totals from anon, authenticated;
