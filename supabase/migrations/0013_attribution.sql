-- Attribution for the organizer's page: where each visitor came from, what they looked at,
-- and what they then did.
--
-- No cookie is involved. A page view already carries a visitor code that is good for one day
-- (a keyed hash of the date, the IP address and the browser name). From now on, each action
-- (signing in, joining the list, pledging and so on) is recorded with the same code for the
-- request that made it. Rows with the same day and code came from the same browser on the
-- same network on the same day, so an action can be read next to that day's page views.
-- The code changes every day, so nothing can be followed from one day to the next.

-- 1. More about each page view. The browser name itself is still not stored: only its class.
alter table public.page_views
  add column device text check (device is null or device in ('mobile', 'tablet', 'desktop')),
  add column utm_medium text check (utm_medium is null or char_length(utm_medium) <= 40),
  add column utm_campaign text check (utm_campaign is null or char_length(utm_campaign) <= 40),
  add column utm_content text check (utm_content is null or char_length(utm_content) <= 40);
create index page_views_visitor_idx on public.page_views (day, visitor, created_at);

-- 2. What people did. `subject` is a short reference (an idea's slug, or the id of a pledge,
-- list entry or inquiry): never free text and never an email address, which the check enforces.
-- `visitor` is null when the action cannot be tied to page views: it was the organizer's, it
-- came from a mail app, or it happened before this table existed (`untracked`).
create table public.events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  day date not null,
  visitor text check (visitor is null or char_length(visitor) = 16),
  kind text not null check (kind in (
    'signed_in', 'checks_passed', 'checks_failed', 'joined_builder', 'list_joined', 'pledged',
    'idea_posted', 'hearted', 'panel_applied', 'organize_offered', 'sponsor_inquiry', 'unsubscribed')),
  person_id uuid references public.people (id) on delete cascade,
  subject text check (subject is null or subject ~ '^[A-Za-z0-9_-]{1,80}$'),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  untracked boolean not null default false
);
create index events_visitor_idx on public.events (day, visitor);
create index events_person_idx on public.events (person_id);
create index events_subject_idx on public.events (kind, subject);
alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;

-- What already happened, taken only from timestamps the tables already hold. These rows have
-- no visitor code, because none was recorded at the time, and are marked as such.
insert into public.events (created_at, day, kind, person_id, subject, country, untracked)
select t.at, (t.at at time zone 'utc')::date, t.kind, t.person_id, t.subject, t.country, true
  from (
    select p.created_at as at, 'signed_in' as kind, p.id as person_id, null::text as subject, p.country from public.people p
    union all
    select p.checked_at, case when p.verified then 'checks_passed' else 'checks_failed' end, p.id, null, p.country
      from public.people p where p.checked_at is not null
    union all
    select p.joined_at, 'joined_builder', p.id, null, p.country from public.people p where p.is_builder and p.joined_at is not null
    union all
    select s.subscribed_at, 'list_joined', s.person_id, s.id::text, s.country from public.subscribers s
    union all
    select s.unsubscribed_at, 'unsubscribed', s.person_id, s.id::text, s.country from public.subscribers s where s.unsubscribed_at is not null
    union all
    select g.created_at, 'pledged', g.person_id, g.id::text, null from public.pledges g
    union all
    select i.created_at, 'idea_posted', i.author_id, i.slug, null from public.ideas i where i.author_id is not null
    union all
    select h.created_at, 'hearted', null, i.slug, null from public.idea_hearts h join public.ideas i on i.id = h.idea_id
    union all
    select a.created_at, 'panel_applied', a.person_id, null, a.country from public.panel_applications a
    union all
    select o.created_at, 'organize_offered', o.person_id, null, o.country from public.organize_offers o
    union all
    select q.created_at, 'sponsor_inquiry', null, q.id::text, q.country from public.sponsor_inquiries q
  ) t
 where t.subject is null or t.subject ~ '^[A-Za-z0-9_-]{1,80}$';

-- 3. A readable name for where a visit came from. A tag on the link (`?ref=` or `utm_source`)
-- wins over the referring site, because most apps hide the referrer. Well-known tags and hosts
-- are folded into one key each; anything else is shown as it arrived. The same table lives in
-- src/lib/sources.ts, and a test keeps the two in step.
create function public.source_alias(p text) returns text
language sql immutable set search_path = ''
as $$
  select case
    when p in ('x', 'twitter', 'x.com', 'twitter.com', 't.co', 'mobile.twitter.com', 'mobile.x.com') then 'x'
    when p in ('reddit', 'reddit.com', 'old.reddit.com', 'new.reddit.com', 'out.reddit.com', 'redd.it') then 'reddit'
    when p in ('hn', 'hackernews', 'ycombinator', 'news.ycombinator.com', 'hckrnews.com') then 'hackernews'
    when p in ('github', 'gh', 'github.com', 'gist.github.com') then 'github'
    when p in ('linkedin', 'li', 'linkedin.com', 'lnkd.in') then 'linkedin'
    when p in ('tiktok', 'tt', 'tiktok.com') then 'tiktok'
    when p in ('youtube', 'yt', 'youtube.com', 'm.youtube.com', 'youtu.be') then 'youtube'
    when p in ('facebook', 'fb', 'facebook.com', 'm.facebook.com', 'l.facebook.com', 'lm.facebook.com') then 'facebook'
    when p in ('instagram', 'ig', 'instagram.com', 'l.instagram.com') then 'instagram'
    when p in ('threads', 'threads.net', 'threads.com') then 'threads'
    when p in ('bluesky', 'bsky', 'bsky.app', 'go.bsky.app') then 'bluesky'
    when p in ('discord', 'discord.com', 'discordapp.com') then 'discord'
    when p in ('telegram', 't.me', 'web.telegram.org') then 'telegram'
    when p in ('producthunt', 'ph', 'producthunt.com') then 'producthunt'
    when p in ('email', 'newsletter', 'mail', 'mail.google.com', 'outlook.live.com', 'outlook.office.com') then 'email'
    when p in ('chatgpt.com', 'chat.openai.com', 'perplexity.ai', 'claude.ai', 'gemini.google.com', 'copilot.microsoft.com') then 'ai'
    when p in ('google', 'bing', 'duckduckgo', 'search', 'bing.com', 'duckduckgo.com', 'search.brave.com', 'yahoo.com',
               'search.yahoo.com', 'ecosia.org', 'kagi.com', 'startpage.com', 'baidu.com', 'yandex.com', 'yandex.ru')
      or p ~ '^google\.[a-z.]{2,6}$' then 'search'
  end;
$$;

create function public.source_key(p_tag text, p_host text) returns text
language sql immutable set search_path = ''
as $$
  select coalesce(
    public.source_alias(nullif(lower(p_tag), '')), nullif(lower(p_tag), ''),
    public.source_alias(nullif(lower(p_host), '')), nullif(lower(p_host), ''),
    'direct');
$$;

-- The actions that count as signing up for something, for conversion.
create function public.signup_kinds() returns text[]
language sql immutable set search_path = ''
as $$
  select array['signed_in', 'joined_builder', 'list_joined', 'pledged', 'panel_applied', 'organize_offered', 'sponsor_inquiry'];
$$;

-- 4. One row per visitor per day. The first page view of the day gives the landing page, the
-- source, the device and the country; then the pages in order, and what the visitor did.
--
-- `automated` marks a visitor-day that looks like a program, using only what is already stored.
-- It is a label, never a filter applied silently: nothing is hidden or deleted because of it.
--   'fast'   three or more views, less than a second apart on average;
--   'inner'  one view only, straight onto an inner page (not the homepage, not an idea's page),
--            with no referring site and no tag, and nothing done afterwards;
--   'burst'  one view of the homepage only, no referring site, no tag, nothing done, and at
--            least four others exactly like it from the same country in the same minute.
-- A visitor-day with any action is never marked.
create function public.visitor_days(p_from date, p_to date)
returns table (
  day date, visitor text, first_at timestamptz, last_at timestamptz, views int, landing text,
  country text, device text, referrer_host text, utm_source text, utm_medium text, utm_campaign text,
  utm_content text, source text, pages jsonb, events jsonb, signups int, automated text
)
language sql stable security invoker set search_path = ''
as $$
  with d as (
    select v.day, v.visitor,
           min(v.created_at) as first_at, max(v.created_at) as last_at, count(*)::int as views,
           (array_agg(v.path order by v.created_at, v.id))[1] as landing,
           (array_agg(v.country order by v.created_at, v.id))[1] as country,
           (array_agg(v.device order by v.created_at, v.id))[1] as device,
           (array_agg(v.referrer_host order by v.created_at, v.id))[1] as referrer_host,
           (array_agg(v.utm_source order by v.created_at, v.id))[1] as utm_source,
           (array_agg(v.utm_medium order by v.created_at, v.id))[1] as utm_medium,
           (array_agg(v.utm_campaign order by v.created_at, v.id))[1] as utm_campaign,
           (array_agg(v.utm_content order by v.created_at, v.id))[1] as utm_content,
           jsonb_agg(jsonb_build_object('at', v.created_at, 'path', v.path) order by v.created_at, v.id) as pages
      from public.page_views v
     where v.day between p_from and p_to
     group by v.day, v.visitor
  ), e as (
    select ev.day, ev.visitor,
           jsonb_agg(jsonb_build_object('at', ev.created_at, 'kind', ev.kind, 'subject', ev.subject, 'person', ev.person_id) order by ev.created_at, ev.id) as events,
           (count(*) filter (where ev.kind = any (public.signup_kinds())))::int as signups
      from public.events ev
     where ev.visitor is not null and ev.day between p_from and p_to
     group by ev.day, ev.visitor
  ), j as (
    select d.*, coalesce(e.events, '[]'::jsonb) as events, coalesce(e.signups, 0) as signups,
           (e.visitor is not null) as acted,
           (d.views = 1 and e.visitor is null and d.referrer_host is null and d.utm_source is null) as bare
      from d left join e on e.day = d.day and e.visitor = d.visitor
  )
  select j.day, j.visitor, j.first_at, j.last_at, j.views, j.landing, j.country, j.device,
         j.referrer_host, j.utm_source, j.utm_medium, j.utm_campaign, j.utm_content,
         public.source_key(j.utm_source, j.referrer_host), j.pages, j.events, j.signups,
         case
           when j.acted then null
           when j.views >= 3 and j.last_at - j.first_at < (j.views - 1) * interval '1 second' then 'fast'
           when j.bare and j.landing <> '/' and j.landing not like '/ideas/%' then 'inner'
           when j.bare and j.landing = '/'
                and count(*) filter (where j.bare and j.landing = '/')
                      over (partition by j.country, date_trunc('minute', j.first_at)) >= 5 then 'burst'
         end
    from j;
$$;

-- 5. Everything the overview and the sources table show. With p_humans, visitor-days marked
-- as possibly automated are left out of every number; by default they are counted.
-- "Converted" is a visitor-day with at least one sign-up of any kind.
create function public.admin_report(p_days int default 30, p_humans boolean default false) returns json
language sql stable security invoker set search_path = ''
as $$
  with vd as materialized (
    select x.* from public.visitor_days(current_date - (greatest(p_days, 3) - 1), current_date) x
     where not p_humans or x.automated is null
  ), r (key, a, b) as (
    values ('today', current_date, current_date), ('yesterday', current_date - 1, current_date - 1),
           ('d7', current_date - 6, current_date), ('d30', current_date - (greatest(p_days, 3) - 1), current_date)
  ), ev as (
    select vd.day, vd.source, vd.landing, e.value ->> 'kind' as kind
      from vd, jsonb_array_elements(vd.events) e
  )
  select json_build_object(
    'totals', (
      select json_object_agg(r.key, json_build_object(
        'visitors', (select count(*) from vd where vd.day between r.a and r.b),
        'views', (select coalesce(sum(vd.views), 0) from vd where vd.day between r.a and r.b),
        'converted', (select count(*) from vd where vd.day between r.a and r.b and vd.signups > 0),
        'automated', (select count(*) from vd where vd.day between r.a and r.b and vd.automated is not null),
        'events', (select coalesce(json_object_agg(k.kind, k.c), '{}'::json)
                     from (select x.kind, count(*) as c from public.events x where x.day between r.a and r.b group by x.kind) k)
      )) from r),
    'hourly', (
      select json_agg(json_build_object('at', h.at, 'visitors', coalesce(x.visitors, 0), 'views', coalesce(x.views, 0)) order by h.at)
        from generate_series(date_trunc('hour', now()) - interval '47 hours', date_trunc('hour', now()), interval '1 hour') h (at)
        left join (
          select date_trunc('hour', pv.created_at) as at, count(distinct pv.visitor) as visitors, count(*) as views
            from public.page_views pv join vd on vd.day = pv.day and vd.visitor = pv.visitor
           where pv.created_at >= date_trunc('hour', now()) - interval '47 hours'
           group by 1) x on x.at = h.at),
    'daily', (
      select json_agg(json_build_object('day', g.day, 'visitors', coalesce(x.visitors, 0), 'views', coalesce(x.views, 0), 'converted', coalesce(x.converted, 0)) order by g.day)
        from (select generate_series(current_date - (greatest(p_days, 3) - 1), current_date, interval '1 day')::date as day) g
        left join (select vd.day, count(*) as visitors, sum(vd.views) as views, count(*) filter (where vd.signups > 0) as converted from vd group by vd.day) x on x.day = g.day),
    'sources', (select coalesce(json_agg(t), '[]'::json) from (
      select s.source as label, s.visitors, s.views, s.converted, s.hosts, s.campaigns,
             coalesce((select json_object_agg(k.kind, k.c) from (select ev.kind, count(*) as c from ev where ev.source = s.source group by ev.kind) k), '{}'::json) as events
        from (select vd.source, count(*) as visitors, sum(vd.views) as views, count(*) filter (where vd.signups > 0) as converted,
                     coalesce(array_agg(distinct vd.referrer_host) filter (where vd.referrer_host is not null), '{}') as hosts,
                     coalesce(array_agg(distinct vd.utm_campaign) filter (where vd.utm_campaign is not null), '{}') as campaigns
                from vd group by vd.source) s
       order by s.visitors desc, s.source limit 50) t),
    'landings', (select coalesce(json_agg(t), '[]'::json) from (
      select vd.landing as label, count(*) as visitors, sum(vd.views) as views, count(*) filter (where vd.signups > 0) as converted
        from vd group by vd.landing order by 2 desc, 1 limit 25) t),
    'pages', (select coalesce(json_agg(t), '[]'::json) from (
      select pv.path as label, count(distinct (pv.day, pv.visitor)) as visitors, count(*) as views
        from public.page_views pv join vd on vd.day = pv.day and vd.visitor = pv.visitor
       group by pv.path order by 3 desc, 1 limit 25) t),
    'countries', (select coalesce(json_agg(t), '[]'::json) from (
      select coalesce(vd.country, 'unknown') as label, count(*) as visitors, sum(vd.views) as views, count(*) filter (where vd.signups > 0) as converted
        from vd group by 1 order by 2 desc, 1 limit 40) t),
    'devices', (select coalesce(json_agg(t), '[]'::json) from (
      select coalesce(vd.device, 'not recorded') as label, count(*) as visitors, sum(vd.views) as views, count(*) filter (where vd.signups > 0) as converted
        from vd group by 1 order by 2 desc, 1) t)
  );
$$;

-- 6. The most recent visitor-days, newest first, each with its pages and actions.
create function public.recent_visitors(p_limit int default 200, p_offset int default 0, p_humans boolean default false) returns json
language sql stable security invoker set search_path = ''
as $$
  with vd as materialized (
    select x.* from public.visitor_days(current_date - 29, current_date) x where not p_humans or x.automated is null
  )
  select json_build_object(
    'total', (select count(*) from vd),
    'rows', (select coalesce(json_agg(t), '[]'::json) from (
      select * from vd order by vd.first_at desc, vd.visitor
       limit least(greatest(p_limit, 1), 500) offset greatest(p_offset, 0)) t));
$$;

-- 7. Every person and contact, with everything they did. A person is matched by account; an
-- address with no account is its own contact, and a sponsor inquiry from the same address is
-- shown with it. `journeys` holds the visitor-day for each action that has one.
create function public.admin_people() returns json
language sql stable security invoker set search_path = ''
as $$
  with contact_emails as (
    select s.email from public.subscribers s where s.person_id is null
    union
    select q.email from public.sponsor_inquiries q
  )
  select json_build_object(
    'people', (select coalesce(json_agg(t order by t.last_at desc), '[]'::json) from (
      select p.id, p.handle, p.github_id, p.verified, p.failed_rules, p.is_builder, p.country, p.created_at, p.joined_at,
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

-- 8. One person's journey, or one list entry's: their actions, and the visitor-day behind each.
create function public.journey_for(p_person uuid default null, p_subscriber uuid default null) returns json
language sql stable security invoker set search_path = ''
as $$
  with mine as (
    select e.* from public.events e
     where (p_person is not null and e.person_id = p_person)
        or (p_subscriber is not null and e.kind in ('list_joined', 'unsubscribed') and e.subject = p_subscriber::text)
  )
  select json_build_object(
    'events', (select coalesce(json_agg(json_build_object('at', m.created_at, 'kind', m.kind, 'subject', m.subject, 'day', m.day, 'visitor', m.visitor, 'untracked', m.untracked) order by m.created_at, m.id), '[]'::json) from mine m),
    'journeys', (select coalesce(json_agg(row_to_json(vd) order by vd.first_at), '[]'::json)
      from public.visitor_days((select min(m.day) from mine m where m.visitor is not null), (select max(m.day) from mine m where m.visitor is not null)) vd
     where exists (select 1 from mine m where m.day = vd.day and m.visitor = vd.visitor)));
$$;

revoke execute on function public.source_alias(text) from public, anon, authenticated;
revoke execute on function public.source_key(text, text) from public, anon, authenticated;
revoke execute on function public.signup_kinds() from public, anon, authenticated;
revoke execute on function public.visitor_days(date, date) from public, anon, authenticated;
revoke execute on function public.admin_report(int, boolean) from public, anon, authenticated;
revoke execute on function public.recent_visitors(int, int, boolean) from public, anon, authenticated;
revoke execute on function public.admin_people() from public, anon, authenticated;
revoke execute on function public.journey_for(uuid, uuid) from public, anon, authenticated;
grant execute on function public.source_alias(text) to service_role;
grant execute on function public.source_key(text, text) to service_role;
grant execute on function public.signup_kinds() to service_role;
grant execute on function public.visitor_days(date, date) to service_role;
grant execute on function public.admin_report(int, boolean) to service_role;
grant execute on function public.recent_visitors(int, int, boolean) to service_role;
grant execute on function public.admin_people() to service_role;
grant execute on function public.journey_for(uuid, uuid) to service_role;
