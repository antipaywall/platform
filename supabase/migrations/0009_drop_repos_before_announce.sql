-- The rule about a public repo from before the announcement was removed,
-- so the number it used is no longer stored.
alter table public.people drop column if exists repos_before_announce;
