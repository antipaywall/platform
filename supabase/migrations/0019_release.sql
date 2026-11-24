-- The release: one builder namespace (usernames), Season 1 entries, ideas kept in the
-- antipaywall/ideas GitHub repo, adopting a project, and keys for the Antipaywall MCP.
--
-- Additive only, like 0018: new tables and new columns. Nothing the live site reads is dropped,
-- renamed or changed. New tables have row-level security on and no policies.

-- Usernames. Everyone is a builder at /builders/<username>. For a GitHub sign-in it is the GitHub
-- login; for GitLab, the GitLab handle unless it collides (see src/lib/usernames.ts).
alter table public.people
  add column username text check (username is null or username ~ '^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$'),
  -- A GitHub login the person proved is theirs by connecting it (GitLab builders only).
  add column github_login text;
create unique index people_username on public.people (lower(username)) where username is not null;
-- Every current account signed in with GitHub, so its username is its handle.
update public.people set username = handle where username is null and handle ~ '^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$';

-- Old usernames keep working: a rename leaves a redirect behind.
create table public.username_redirects (
  old_username text primary key,
  person_id uuid not null references public.people (id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index username_redirects_lower on public.username_redirects (lower(old_username));

-- How many top gaps become a season's briefs.
alter table public.seasons add column brief_count int not null default 5 check (brief_count between 1 and 50);

-- Season entries: a builder becomes a "Season 1 builder" once they start their entry repo.
create table public.season_entries (
  season_id int not null references public.seasons (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  repo_full_name text not null,
  repo_github_id bigint not null,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (season_id, person_id)
);
create unique index season_entries_repo on public.season_entries (season_id, repo_github_id);

-- Ideas are files in the antipaywall/ideas repo; these rows are the site's cache of them.
alter table public.ideas
  add column repo_path text,
  add column repo_sha text,
  add column synced_from_repo_at timestamptz,
  add column started_by_login text;
create unique index ideas_repo_path on public.ideas (repo_path) where repo_path is not null;

-- Suggested improvements to an idea: pull requests on the ideas repo, cached from the App's events.
create table public.idea_suggestions (
  idea_id uuid not null references public.ideas (id) on delete cascade,
  pr_number int not null,
  author_login text not null,
  person_id uuid references public.people (id) on delete set null,
  title text not null default '',
  state text not null check (state in ('open', 'merged', 'closed')),
  mergeable boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (idea_id, pr_number)
);
create index idea_suggestions_open on public.idea_suggestions (idea_id) where state = 'open';

-- Adopting a project: "Looking for a new owner", with the terms the original builder sets.
-- Antipaywall shows the terms; it never enforces them or handles money.
create table public.adoptions (
  id uuid primary key default gen_random_uuid(),
  subject_kind text not null check (subject_kind in ('project', 'gap')),
  subject_id uuid not null,
  offered_by uuid not null references public.people (id) on delete cascade,
  terms text[] not null default '{}' check (terms <@ array['open_source', 'credit', 'advise', 'ask_first']::text[]),
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'open' check (status in ('open', 'taken', 'withdrawn')),
  taken_by uuid references public.people (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index adoptions_one_open on public.adoptions (subject_kind, subject_id) where status = 'open';

create table public.adoption_interest (
  adoption_id uuid not null references public.adoptions (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  note text check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now(),
  primary key (adoption_id, person_id)
);

-- Keys for the Antipaywall MCP. Only a hash is kept; the key is shown once.
create table public.mcp_keys (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  name text not null default 'MCP key' check (char_length(name) between 1 and 60),
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index mcp_keys_person on public.mcp_keys (person_id);

do $$
declare t text;
begin
  foreach t in array array[
    'username_redirects', 'season_entries', 'idea_suggestions', 'adoptions', 'adoption_interest', 'mcp_keys'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
