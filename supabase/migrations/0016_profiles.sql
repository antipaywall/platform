-- Builder profiles.
--
-- What the provider says about the account (name, bio, location, public repo count), what the
-- person writes themselves (about, skills, team note), whether a non-builder's profile is public,
-- and a saved copy of their public repositories so a profile never waits on GitHub or GitLab.

alter table public.people
  add column name text check (name is null or char_length(name) <= 120),
  add column bio text check (bio is null or char_length(bio) <= 400),
  add column location text check (location is null or char_length(location) <= 120),
  add column repo_count int check (repo_count is null or repo_count >= 0),
  add column about text check (about is null or char_length(about) <= 400),
  add column skills text[] not null default '{}' check (cardinality(skills) <= 8),
  add column open_to_team boolean not null default false,
  add column team_note text check (team_note is null or char_length(team_note) <= 140),
  add column profile_public boolean not null default false,
  add column featured_repos text[] not null default '{}' check (cardinality(featured_repos) <= 6),
  add column repos jsonb not null default '[]'::jsonb check (jsonb_typeof(repos) = 'array'),
  add column repos_fetched_at timestamptz;

-- One profile address per username on each provider.
create unique index people_provider_handle on public.people (provider, lower(handle));
