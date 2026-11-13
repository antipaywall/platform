-- The social layer: posts and one-level replies, "lay a brick" reactions, following people,
-- reports for moderation, badges given by the organizer, and a saved activity calendar.
--
-- Additive only: nothing the live site reads is renamed, changed or dropped.
-- Every table is locked (row level security on, no policies); only the server's key reads them.

alter table public.people
  -- Daily counts for the last year: {"public": [[day, n], ...], "all": [[day, n], ...]}.
  add column contributions jsonb not null default '{}'::jsonb check (jsonb_typeof(contributions) = 'object'),
  add column contributions_fetched_at timestamptz,
  -- The organizer can take away someone's ability to post.
  add column can_post boolean not null default true;

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  -- A reply has a parent, and the parent is always a top-level post (one level only).
  parent_id uuid references public.posts (id) on delete cascade,
  kind text check (kind in ('update', 'team', 'ask', 'shipped')),
  body text not null check (char_length(body) between 1 and 500),
  link_url text check (link_url is null or (link_url ~ '^https://' and char_length(link_url) <= 300)),
  created_at timestamptz not null default now(),
  hidden_at timestamptz,
  -- A top-level post has a kind; a reply never does.
  constraint posts_kind_only_on_posts check ((parent_id is null) = (kind is not null))
);
create index posts_person on public.posts (person_id, created_at desc);
create index posts_parent on public.posts (parent_id, created_at);
create index posts_recent on public.posts (created_at desc) where parent_id is null and hidden_at is null;

-- A reply's parent must itself be a top-level post.
create function public.posts_one_level() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.parent_id is not null and exists (select 1 from public.posts p where p.id = new.parent_id and p.parent_id is not null) then
    raise exception 'replies go one level deep';
  end if;
  return new;
end;
$$;
create trigger posts_one_level before insert on public.posts for each row execute function public.posts_one_level();

create table public.post_bricks (
  post_id uuid not null references public.posts (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, person_id)
);
create index post_bricks_person on public.post_bricks (person_id);

create table public.follows (
  follower_id uuid not null references public.people (id) on delete cascade,
  followee_id uuid not null references public.people (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee on public.follows (followee_id);

create table public.post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  reporter_id uuid not null references public.people (id) on delete cascade,
  reason text check (reason is null or char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  handled boolean not null default false,
  unique (post_id, reporter_id)
);

-- Badges the organizer gives. Badges earned by doing something are worked out, not stored.
create table public.badges (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  kind text not null check (kind in ('founder', 'organizer', 'panel', 'sponsor', 'winner')),
  season int check (season is null or season > 0),
  place int check (place is null or place between 1 and 9),
  note text check (note is null or char_length(note) <= 80),
  granted_at timestamptz not null default now(),
  unique (person_id, kind, season)
);
-- Only one founding organizer, ever.
create unique index badges_one_founder on public.badges (kind) where kind = 'founder';

-- The founding organizer is Ethan, the account the site already treats as the organizer.
insert into public.badges (person_id, kind)
select id, 'founder' from public.people where github_id = 249879463
on conflict do nothing;

alter table public.posts enable row level security;
alter table public.post_bricks enable row level security;
alter table public.follows enable row level security;
alter table public.post_reports enable row level security;
alter table public.badges enable row level security;

-- The Everyone feed, ranked. Responses push a post up and time pulls it down (the same idea
-- as Hacker News): (bricks + 2 * replies + 1) / (hours + 2) ^ 1.5. A builder's first three
-- posts get 1.5x, "Looking for a team" and "Shipped" get 1.3x while `p_boost_kinds` is on
-- (build week), and nobody has more than two posts in Top. Only the last 14 days count.
create function public.feed_top(p_limit int default 30, p_offset int default 0, p_kind text default null, p_boost_kinds boolean default false)
returns setof uuid
language sql stable security invoker set search_path = ''
as $$
  with scored as (
    select p.id, p.person_id,
           (coalesce(b.n, 0) + 2 * coalesce(r.n, 0) + 1)
             / power(extract(epoch from (now() - p.created_at)) / 3600 + 2, 1.5)
             * case when (select count(*) from public.posts q where q.person_id = p.person_id and q.parent_id is null and q.created_at <= p.created_at) <= 3 then 1.5 else 1 end
             * case when p_boost_kinds and p.kind in ('team', 'shipped') then 1.3 else 1 end as score
      from public.posts p
      join public.people a on a.id = p.person_id and a.can_post
      left join (select post_id, count(*) n from public.post_bricks group by post_id) b on b.post_id = p.id
      left join (select parent_id, count(*) n from public.posts where hidden_at is null group by parent_id) r on r.parent_id = p.id
     where p.parent_id is null and p.hidden_at is null
       and p.created_at > now() - interval '14 days'
       and (p_kind is null or p.kind = p_kind)
  ),
  ranked as (
    select id, score, row_number() over (partition by person_id order by score desc) as nth from scored
  )
  select id from ranked where nth <= 2 order by score desc limit p_limit offset p_offset;
$$;

revoke execute on function public.feed_top(int, int, text, boolean) from public, anon, authenticated;
grant execute on function public.feed_top(int, int, text, boolean) to service_role;
revoke execute on function public.posts_one_level() from public, anon, authenticated;
