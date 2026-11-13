-- The platform: paid products, open-source projects pulled from GitHub, topics, signals,
-- merges of duplicate gaps, claims, email backers, seasons, and the sync's own log.
--
-- Additive only. The live site keeps running on the same database until this branch is merged,
-- so nothing here drops, renames or changes anything it reads. Like every other table, the new
-- ones have row-level security on and no policies: only the site's server can read or write them.
-- Gaps are the existing `ideas` rows; "me too" on a gap stays a heart in `idea_hearts`.

create extension if not exists pg_trgm with schema extensions;

-- Paid products. The source of truth is catalog/products/*.yml in the repo; the sync copies it here.
create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 60),
  category text not null,
  price_cents int check (price_cents is null or price_cents >= 0),
  price_period text check (price_period in ('month', 'year', 'once')),
  words text[] not null default '{}',
  topics text[] not null default '{}',
  search_terms text[] not null default '{}',
  aliases text[] not null default '{}',
  excludes text[] not null default '{}',
  blurb text not null default '' check (char_length(blurb) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_name_trgm on public.products using gin (name extensions.gin_trgm_ops);

-- GitHub topics we track, with a plain-words name. The uuid lets people follow a topic.
create table public.topics (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  blurb text not null default '',
  tracked boolean not null default true,
  created_at timestamptz not null default now()
);

-- Public GitHub repositories, pulled by the sync. Nobody lists one by hand.
-- `listed` is false for repos the junk filter turned away, with the reason kept.
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  github_id bigint not null unique,
  full_name text not null,
  owner text not null,
  name text not null,
  url text not null check (url like 'https://github.com/%'),
  description text,
  homepage text,
  topics text[] not null default '{}',
  license_spdx text,
  license_name text,
  stars int not null default 0,
  forks int not null default 0,
  open_issues int not null default 0,
  help_wanted int not null default 0,
  good_first int not null default 0,
  contributors int,
  contributors_at timestamptz,
  archived boolean not null default false,
  pushed_at timestamptz,
  created_on_github timestamptz,
  latest_release_tag text,
  latest_release_at timestamptz,
  star_points jsonb not null default '[]'::jsonb check (jsonb_typeof(star_points) = 'array'),
  star_points_at timestamptz,
  synced_at timestamptz not null default now(),
  listed boolean not null default false,
  indexable boolean not null default false,
  reject_reason text
);
create unique index projects_full_name on public.projects (lower(full_name));
create index projects_full_name_trgm on public.projects using gin (full_name extensions.gin_trgm_ops);
create index projects_topics on public.projects using gin (topics);

-- One row per project per day, written by the sync, so star growth gets finer from launch on.
create table public.project_snapshots (
  project_id uuid not null references public.projects (id) on delete cascade,
  day date not null,
  stars int not null,
  forks int not null,
  primary key (project_id, day)
);

-- Which projects stand in for which paid products, and how the link was found.
create table public.project_products (
  project_id uuid not null references public.projects (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  source text not null check (source in ('topic', 'search', 'catalog', 'tag', 'pr')),
  score real not null default 0,
  primary key (project_id, product_id)
);
create index project_products_product on public.project_products (product_id);

-- Open issues the maintainers labeled "help wanted" or "good first issue".
create table public.help_issues (
  project_id uuid not null references public.projects (id) on delete cascade,
  number int not null,
  title text not null,
  url text not null check (url like 'https://github.com/%'),
  labels text[] not null default '{}',
  comments int not null default 0,
  updated_at timestamptz,
  primary key (project_id, number)
);

-- Gaps attached to the paid products they would replace.
create table public.gap_products (
  idea_id uuid not null references public.ideas (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  primary key (idea_id, product_id)
);
create index gap_products_product on public.gap_products (product_id);

-- Email backers: people who signed in with an email link. The people table only takes GitHub
-- or GitLab accounts, so they live here. Keyed by the same auth user id.
create table public.backers (
  id uuid primary key references auth.users (id) on delete cascade,
  name text check (name is null or char_length(name) <= 60),
  about text check (about is null or char_length(about) <= 400),
  public boolean not null default false,
  created_at timestamptz not null default now()
);

-- Gaps get a build status, can be merged into another gap, can name products we don't list yet,
-- can be posted by an email backer, and carry plain words the matcher uses.
alter table public.ideas
  add column build_status text not null default 'wanted' check (build_status in ('wanted', 'building', 'exists')),
  add column merged_into uuid references public.ideas (id) on delete set null,
  add column named_products text[] not null default '{}',
  add column backer_id uuid references public.backers (id) on delete set null,
  add column words text[] not null default '{}';
create index ideas_merged_into on public.ideas (merged_into) where merged_into is not null;
create index ideas_title_trgm on public.ideas using gin (title extensions.gin_trgm_ops);

-- A signed-in "me too" also records who, so one person's hearts from two browsers count once.
alter table public.idea_hearts add column user_id uuid references auth.users (id) on delete set null;
create index idea_hearts_user on public.idea_hearts (user_id) where user_id is not null;

-- A stance on a paid product, a project or a gap. Never money: "pay" is what someone says
-- they would pay if it worked. Keyed by person when signed in, otherwise by the browser's id.
create table public.signals (
  id uuid primary key default gen_random_uuid(),
  subject_kind text not null check (subject_kind in ('product', 'project', 'gap')),
  subject_id uuid not null,
  kind text not null check (kind in ('use', 'switch', 'pay', 'test')),
  pay_cents int check (pay_cents is null or pay_cents between 1 and 1000000),
  pay_period text check (pay_period in ('month', 'once')),
  user_id uuid references auth.users (id) on delete cascade,
  visitor uuid,
  created_at timestamptz not null default now(),
  check (user_id is not null or visitor is not null),
  check ((kind = 'pay') = (pay_cents is not null and pay_period is not null))
);
create unique index signals_one on public.signals (subject_kind, subject_id, kind, coalesce(user_id, visitor));
create index signals_subject on public.signals (subject_kind, subject_id);
create index signals_user on public.signals (user_id) where user_id is not null;
create index signals_visitor on public.signals (visitor) where visitor is not null;

-- Every merge, public and undoable, with its reason.
create table public.merge_log (
  id uuid primary key default gen_random_uuid(),
  from_idea uuid not null references public.ideas (id) on delete cascade,
  into_idea uuid not null references public.ideas (id) on delete cascade,
  source text not null check (source in ('poster', 'pr', 'admin')),
  reason text not null default '' check (char_length(reason) <= 300),
  by_user uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  undone_by uuid references auth.users (id) on delete set null
);
create index merge_log_into on public.merge_log (into_idea);

-- Pairs someone said are not the same. The matcher never merges them again. Stored smaller id first.
create table public.merge_blocks (
  a uuid not null references public.ideas (id) on delete cascade,
  b uuid not null references public.ideas (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (a, b),
  check (a < b)
);

-- Builders on a gap. Never exclusive: it helps people find each other.
create table public.gap_claims (
  idea_id uuid not null references public.ideas (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  note text check (note is null or char_length(note) <= 140),
  repo_url text check (repo_url is null or repo_url ~ '^https://(github|gitlab)\.com/'),
  created_at timestamptz not null default now(),
  primary key (idea_id, person_id)
);

-- Searches that found nothing good. Only the words: no person, no visitor id, no address.
create table public.search_misses (
  query_norm text primary key check (char_length(query_norm) between 3 and 100),
  count int not null default 1,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now()
);

-- Hackathon seasons. Season 1 is the hackathon already running.
create table public.seasons (
  id int primary key,
  name text not null,
  status text not null check (status in ('collecting', 'open', 'building', 'voting', 'done')),
  starts_at timestamptz,
  ends_at timestamptz
);
insert into public.seasons (id, name, status) values (1, 'Season 1', 'collecting');

-- A season's briefs, frozen from the top gaps when the season opens.
create table public.season_briefs (
  season_id int not null references public.seasons (id) on delete cascade,
  idea_id uuid not null references public.ideas (id) on delete cascade,
  rank int not null,
  primary key (season_id, idea_id)
);

-- What each sync run did, for "Synced from GitHub 2 hours ago".
create table public.sync_log (
  id bigint generated always as identity primary key,
  kind text not null default 'github',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  note text
);

do $$
declare t text;
begin
  foreach t in array array[
    'products', 'topics', 'projects', 'project_snapshots', 'project_products', 'help_issues',
    'gap_products', 'backers', 'signals', 'merge_log', 'merge_blocks', 'gap_claims',
    'search_misses', 'seasons', 'season_briefs', 'sync_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Free matching: full-text (any word may match) plus fuzzy spelling, over products (name,
-- aliases and the plain words people use for the job), listed unmerged gaps, listed projects
-- and topics. Never errors on odd input: websearch_to_tsquery accepts anything.
create function public.match_candidates(p_q text, p_limit int default 8) returns json
language sql stable security invoker set search_path = ''
as $$
  with q as (
    select
      nullif(replace(websearch_to_tsquery('english', coalesce(p_q, ''))::text, ' & ', ' | '), '') as tsq_text,
      lower(coalesce(p_q, '')) as raw
  ), qq as (
    select case when tsq_text is null then null else tsq_text::tsquery end as tsq, raw from q
  )
  select json_build_object(
    'products', (select coalesce(json_agg(r order by r.score desc), '[]'::json) from (
      select p.slug, p.name,
        greatest(
          coalesce(ts_rank_cd(to_tsvector('english', p.name || ' ' || array_to_string(p.aliases, ' ') || ' ' || array_to_string(p.words, ' ') || ' ' || p.blurb), qq.tsq), 0),
          extensions.word_similarity(lower(p.name), qq.raw),
          (select coalesce(max(extensions.word_similarity(lower(a), qq.raw)), 0) from unnest(p.aliases) a)
        ) as score
      from public.products p, qq
      where (qq.tsq is not null and to_tsvector('english', p.name || ' ' || array_to_string(p.aliases, ' ') || ' ' || array_to_string(p.words, ' ') || ' ' || p.blurb) @@ qq.tsq)
         or extensions.word_similarity(lower(p.name), qq.raw) > 0.5
      order by score desc limit p_limit) r),
    'gaps', (select coalesce(json_agg(r order by r.score desc), '[]'::json) from (
      select i.slug, i.title,
        greatest(
          coalesce(ts_rank_cd(to_tsvector('english', i.title || ' ' || i.pitch || ' ' || i.missing || ' ' || array_to_string(i.words, ' ')), qq.tsq), 0),
          extensions.similarity(lower(i.title), qq.raw)
        ) as score
      from public.ideas i, qq
      where i.status = 'listed' and i.merged_into is null
        and ((qq.tsq is not null and to_tsvector('english', i.title || ' ' || i.pitch || ' ' || i.missing || ' ' || array_to_string(i.words, ' ')) @@ qq.tsq)
          or extensions.similarity(lower(i.title), qq.raw) > 0.3)
      order by score desc limit p_limit) r),
    'projects', (select coalesce(json_agg(r order by r.score desc), '[]'::json) from (
      select j.full_name, j.description, j.stars,
        coalesce(ts_rank_cd(to_tsvector('english', j.name || ' ' || coalesce(j.description, '') || ' ' || array_to_string(j.topics, ' ')), qq.tsq), 0)
          * ln(10 + j.stars) as score
      from public.projects j, qq
      where j.listed and qq.tsq is not null
        and to_tsvector('english', j.name || ' ' || coalesce(j.description, '') || ' ' || array_to_string(j.topics, ' ')) @@ qq.tsq
      order by score desc limit p_limit) r),
    'topics', (select coalesce(json_agg(r order by r.score desc), '[]'::json) from (
      select t.slug, t.name,
        coalesce(ts_rank_cd(to_tsvector('english', t.name || ' ' || t.blurb || ' ' || replace(t.slug, '-', ' ')), qq.tsq), 0) as score
      from public.topics t, qq
      where qq.tsq is not null and to_tsvector('english', t.name || ' ' || t.blurb || ' ' || replace(t.slug, '-', ' ')) @@ qq.tsq
      order by score desc limit p_limit) r)
  );
$$;

-- Demand for gaps, counted across each gap and every gap merged into it. A person counts once:
-- by their user id when known, otherwise by their browser id. "Want" is a heart.
create function public.gap_demand(p_ids uuid[])
returns table (idea_id uuid, want int, pay int, pay_cents_month bigint, pay_cents_once bigint, test int)
language sql stable security invoker set search_path = ''
as $$
  with targets as (select unnest(p_ids) as id),
  members as (
    select t.id as target, t.id as member from targets t
    union
    select t.id, i.id from targets t join public.ideas i on i.merged_into = t.id
  ),
  hearts as (
    select m.target, coalesce('u' || h.user_id::text, 'v' || h.visitor::text) as who
    from members m join public.idea_hearts h on h.idea_id = m.member
  ),
  sig as (
    select distinct on (m.target, s.kind, coalesce('u' || s.user_id::text, 'v' || s.visitor::text))
      m.target, s.kind, s.pay_cents, s.pay_period
    from members m join public.signals s on s.subject_kind = 'gap' and s.subject_id = m.member
    order by m.target, s.kind, coalesce('u' || s.user_id::text, 'v' || s.visitor::text), s.created_at desc
  )
  select t.id,
    (select count(distinct who) from hearts h where h.target = t.id)::int,
    (select count(*) from sig s where s.target = t.id and s.kind = 'pay')::int,
    (select coalesce(sum(pay_cents), 0) from sig s where s.target = t.id and s.kind = 'pay' and s.pay_period = 'month')::bigint,
    (select coalesce(sum(pay_cents), 0) from sig s where s.target = t.id and s.kind = 'pay' and s.pay_period = 'once')::bigint,
    (select count(*) from sig s where s.target = t.id and s.kind = 'test')::int
  from targets t;
$$;

-- Demand for a paid product, a person counted once per kind.
create function public.product_demand(p_id uuid) returns json
language sql stable security invoker set search_path = ''
as $$
  with sig as (
    select distinct on (s.kind, coalesce('u' || s.user_id::text, 'v' || s.visitor::text)) s.kind, s.pay_cents, s.pay_period
    from public.signals s where s.subject_kind = 'product' and s.subject_id = p_id
    order by s.kind, coalesce('u' || s.user_id::text, 'v' || s.visitor::text), s.created_at desc
  )
  select json_build_object(
    'use', (select count(*) from sig where kind = 'use'),
    'switch', (select count(*) from sig where kind = 'switch'),
    'pay', (select count(*) from sig where kind = 'pay'),
    'avg_pay_cents_month', (select round(avg(pay_cents)) from sig where kind = 'pay' and pay_period = 'month')
  );
$$;

-- After someone signs in, the signals and hearts this browser gave become theirs. A signal the
-- person had already given from another browser is not counted twice: the browser's copy goes.
create function public.claim_signals(p_visitor uuid, p_user uuid) returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  if p_visitor is null or p_user is null then return; end if;
  delete from public.signals s
   where s.visitor = p_visitor and s.user_id is null
     and exists (select 1 from public.signals t
                  where t.user_id = p_user and t.subject_kind = s.subject_kind
                    and t.subject_id = s.subject_id and t.kind = s.kind);
  update public.signals set user_id = p_user where visitor = p_visitor and user_id is null;
  update public.idea_hearts set user_id = p_user where visitor = p_visitor and user_id is null;
end;
$$;

-- Folds one gap into another. Gaps already folded into the first move with it. Refuses a pair
-- someone said is not the same, a gap into itself, and a target that is itself merged.
create function public.merge_gap(p_from uuid, p_into uuid, p_source text, p_reason text, p_by uuid) returns boolean
language plpgsql security invoker set search_path = ''
as $$
begin
  if p_from = p_into then return false; end if;
  if exists (select 1 from public.merge_blocks where a = least(p_from, p_into) and b = greatest(p_from, p_into)) then return false; end if;
  if exists (select 1 from public.ideas where id = p_into and merged_into is not null) then return false; end if;
  if not exists (select 1 from public.ideas where id = p_from and merged_into is null) then return false; end if;
  update public.ideas set merged_into = p_into where id = p_from or merged_into = p_from;
  insert into public.merge_log (from_idea, into_idea, source, reason, by_user) values (p_from, p_into, p_source, coalesce(p_reason, ''), p_by);
  return true;
end;
$$;

-- Splits a merged gap back out and records that the pair must never be merged again.
create function public.unmerge_gap(p_from uuid, p_by uuid) returns boolean
language plpgsql security invoker set search_path = ''
as $$
declare v_into uuid;
begin
  select merged_into into v_into from public.ideas where id = p_from;
  if v_into is null then return false; end if;
  update public.ideas set merged_into = null where id = p_from;
  update public.merge_log set undone_at = now(), undone_by = p_by where from_idea = p_from and undone_at is null;
  insert into public.merge_blocks (a, b) values (least(p_from, v_into), greatest(p_from, v_into)) on conflict do nothing;
  return true;
end;
$$;

-- Counts a search that found nothing good.
create function public.record_search_miss(p_q text) returns void
language sql security invoker set search_path = ''
as $$
  insert into public.search_misses (query_norm) values (p_q)
  on conflict (query_norm) do update set count = public.search_misses.count + 1, last_at = now();
$$;

-- The directory's headline numbers.
create function public.site_platform_stats() returns json
language sql stable security invoker set search_path = ''
as $$
  select json_build_object(
    'products', (select count(*) from public.products),
    'projects', (select count(*) from public.projects where listed),
    'gaps', (select count(*) from public.ideas where status = 'listed' and merged_into is null),
    'signals', (select count(*) from public.signals) + (select count(*) from public.idea_hearts),
    'synced_at', (select max(finished_at) from public.sync_log where ok)
  );
$$;

revoke execute on function public.match_candidates(text, int) from public, anon, authenticated;
revoke execute on function public.gap_demand(uuid[]) from public, anon, authenticated;
revoke execute on function public.product_demand(uuid) from public, anon, authenticated;
revoke execute on function public.claim_signals(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.merge_gap(uuid, uuid, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.unmerge_gap(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.record_search_miss(text) from public, anon, authenticated;
revoke execute on function public.site_platform_stats() from public, anon, authenticated;
grant execute on function public.match_candidates(text, int) to service_role;
grant execute on function public.gap_demand(uuid[]) to service_role;
grant execute on function public.product_demand(uuid) to service_role;
grant execute on function public.claim_signals(uuid, uuid) to service_role;
grant execute on function public.merge_gap(uuid, uuid, text, text, uuid) to service_role;
grant execute on function public.unmerge_gap(uuid, uuid) to service_role;
grant execute on function public.record_search_miss(text) to service_role;
grant execute on function public.site_platform_stats() to service_role;
