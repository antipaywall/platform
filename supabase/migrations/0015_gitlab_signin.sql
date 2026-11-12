-- GitLab sign-in, alongside GitHub.
--
-- A person signs in with exactly one provider. `provider` says which, and the matching id
-- column holds that provider's numeric account id. The organizer is still matched on GitHub
-- id only, so a GitLab account can never be an organizer.

alter table public.people
  add column provider text not null default 'github' check (provider in ('github', 'gitlab')),
  add column gitlab_id bigint unique,
  alter column github_id drop not null;

alter table public.people
  add constraint people_one_account check (
    (provider = 'github' and github_id is not null and gitlab_id is null)
    or (provider = 'gitlab' and gitlab_id is not null and github_id is null)
  );

-- An address given by a GitLab sign-in, like one given by GitHub's.
alter table public.subscribers drop constraint subscribers_source_check;
alter table public.subscribers add constraint subscribers_source_check check (source in ('form', 'github', 'gitlab'));

create or replace function public.admin_people() returns json
language sql stable security invoker set search_path = ''
as $$
  with contact_emails as (
    select s.email from public.subscribers s where s.person_id is null
    union
    select q.email from public.sponsor_inquiries q
  )
  select json_build_object(
    'people', (select coalesce(json_agg(t order by t.last_at desc), '[]'::json) from (
      select p.id, p.handle, p.provider, p.github_id, p.gitlab_id, p.verified, p.failed_rules, p.is_builder, p.country, p.created_at, p.joined_at,
             greatest(p.created_at, (select max(e.created_at) from public.events e where e.person_id = p.id)) as last_at,
             (select coalesce(json_agg(json_build_object('email', s.email, 'source', s.source, 'subscribed_at', s.subscribed_at, 'unsubscribed_at', s.unsubscribed_at)), '[]'::json)
                from public.subscribers s where s.person_id = p.id) as emails,
             (select coalesce(json_agg(json_build_object('amount_cents', g.amount_cents, 'status', g.status, 'name', g.display_name, 'at', g.created_at) order by g.created_at desc), '[]'::json)
                from public.pledges g where g.person_id = p.id) as pledges,
             (select coalesce(json_agg(json_build_object('slug', i.slug, 'title', i.title, 'at', i.created_at) order by i.created_at desc), '[]'::json)
                from public.ideas i where i.author_id = p.id) as ideas,
             exists (select 1 from public.panel_applications a where a.person_id = p.id) as panel,
             exists (select 1 from public.organize_offers o where o.person_id = p.id) as organize,
             (select coalesce(json_agg(json_build_object('at', e.created_at, 'kind', e.kind, 'subject', e.subject, 'day', e.day, 'visitor', e.visitor, 'untracked', e.untracked) order by e.created_at, e.id), '[]'::json)
                from public.events e where e.person_id = p.id) as events
        from public.people p order by p.created_at desc limit 5000) t),
    'contacts', (select coalesce(json_agg(t order by t.last_at desc), '[]'::json) from (
      select c.email,
             (select json_build_object('source', s.source, 'country', s.country, 'subscribed_at', s.subscribed_at, 'unsubscribed_at', s.unsubscribed_at)
                from public.subscribers s where s.email = c.email and s.person_id is null) as list,
             (select coalesce(json_agg(json_build_object('company', q.company, 'contact', q.contact_name, 'kind', q.kind, 'amount_usd', q.amount_usd, 'country', q.country, 'at', q.created_at) order by q.created_at desc), '[]'::json)
                from public.sponsor_inquiries q where q.email = c.email) as inquiries,
             greatest((select max(s.subscribed_at) from public.subscribers s where s.email = c.email),
                      (select max(q.created_at) from public.sponsor_inquiries q where q.email = c.email)) as last_at,
             (select coalesce(json_agg(json_build_object('at', e.created_at, 'kind', e.kind, 'subject', e.subject, 'day', e.day, 'visitor', e.visitor, 'untracked', e.untracked) order by e.created_at, e.id), '[]'::json)
                from public.events e
               where (e.kind in ('list_joined', 'unsubscribed') and e.subject in (select s.id::text from public.subscribers s where s.email = c.email and s.person_id is null))
                  or (e.kind = 'sponsor_inquiry' and e.subject in (select q.id::text from public.sponsor_inquiries q where q.email = c.email))) as events
        from contact_emails c limit 5000) t),
    'journeys', (select coalesce(json_agg(json_build_object(
        'day', vd.day, 'visitor', vd.visitor, 'first_at', vd.first_at, 'landing', vd.landing, 'source', vd.source,
        'referrer_host', vd.referrer_host, 'utm_source', vd.utm_source, 'utm_medium', vd.utm_medium, 'utm_campaign', vd.utm_campaign,
        'device', vd.device, 'country', vd.country, 'views', vd.views, 'pages', vd.pages)), '[]'::json)
      from public.visitor_days((select min(e.day) from public.events e where e.visitor is not null), current_date) vd
     where exists (select 1 from public.events e where e.day = vd.day and e.visitor = vd.visitor))
  );
$$;

revoke execute on function public.admin_people() from public, anon, authenticated;
grant execute on function public.admin_people() to service_role;
