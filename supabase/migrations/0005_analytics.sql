-- First-party page-view counts. No cookies and no personal data.
--
-- `visitor` is a keyed hash of (day + IP address + browser name), truncated. The
-- key lives only on the server. Because the day is part of it, the same person
-- gets a different value every day, so a visitor can be counted within a day but
-- never followed from one day to the next. The IP address itself is never stored.
create table public.page_views (
  id bigint generated always as identity primary key,
  day date not null,
  path text not null check (char_length(path) <= 120),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  referrer_host text check (referrer_host is null or char_length(referrer_host) <= 100),
  utm_source text check (utm_source is null or char_length(utm_source) <= 40),
  visitor text not null check (char_length(visitor) = 16),
  created_at timestamptz not null default now()
);
create index page_views_day_idx on public.page_views (day);
alter table public.page_views enable row level security;
revoke all on public.page_views from anon, authenticated;

-- The country a person signed in from, as reported by the hosting provider. Two letters, nothing finer.
alter table public.people add column country text check (country is null or country ~ '^[A-Z]{2}$');

-- Everything the organizer's dashboard shows, computed here so it stays right at any size.
-- "Visitors" over several days is each day's visitors added up, because a visitor
-- cannot be recognised from one day to the next.
create function public.analytics_summary(p_days int default 30) returns json
language sql stable security invoker set search_path = ''
as $$
  with v as (
    select day, path, country, referrer_host, utm_source, visitor
      from public.page_views
     where day > current_date - p_days
  )
  select json_build_object(
    'totals', json_build_object(
      'today', (select json_build_object('visitors', count(distinct visitor), 'views', count(*)) from v where day = current_date),
      'd7', (select json_build_object('visitors', count(distinct visitor), 'views', count(*)) from v where day > current_date - 7),
      'd30', (select json_build_object('visitors', count(distinct visitor), 'views', count(*)) from v)
    ),
    'daily', (
      select coalesce(json_agg(json_build_object('day', d.day, 'visitors', coalesce(x.visitors, 0), 'views', coalesce(x.views, 0)) order by d.day), '[]'::json)
        from (select generate_series(current_date - (p_days - 1), current_date, interval '1 day')::date as day) d
        left join (select day, count(distinct visitor) as visitors, count(*) as views from v group by day) x using (day)
    ),
    'pages', (select coalesce(json_agg(t), '[]'::json) from (
      select path as label, count(distinct visitor) as visitors, count(*) as views from v group by path order by views desc, path limit 15) t),
    'referrers', (select coalesce(json_agg(t), '[]'::json) from (
      select referrer_host as label, count(distinct visitor) as visitors, count(*) as views from v where referrer_host is not null group by referrer_host order by visitors desc, referrer_host limit 15) t),
    'sources', (select coalesce(json_agg(t), '[]'::json) from (
      select utm_source as label, count(distinct visitor) as visitors, count(*) as views from v where utm_source is not null group by utm_source order by visitors desc, utm_source limit 15) t),
    'countries', (select coalesce(json_agg(t), '[]'::json) from (
      select coalesce(country, 'unknown') as label, count(distinct visitor) as visitors, count(*) as views from v group by 1 order by visitors desc, 1 limit 40) t),
    'signup_countries', (select coalesce(json_agg(t), '[]'::json) from (
      select coalesce(country, 'unknown') as label, count(*) as people, count(*) filter (where is_builder) as builders from public.people group by 1 order by people desc, 1 limit 40) t),
    'funnel', json_build_object(
      'visitors', (select count(distinct visitor) from public.page_views),
      'signed_in', (select count(*) from public.people),
      'passed', (select count(*) from public.people where verified),
      'joined', (select count(*) from public.people where is_builder),
      'posted', (select count(distinct author_id) from public.ideas),
      'pledged', (select count(distinct person_id) from public.pledges where status in ('held', 'listed', 'fulfilled'))
    )
  );
$$;

revoke execute on function public.analytics_summary(int) from public, anon, authenticated;
grant execute on function public.analytics_summary(int) to service_role;
