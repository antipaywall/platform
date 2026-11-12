-- A pledge needs a way to reach the pledger when the pool opens, and a pledger can ask
-- not to be named in public.
--
-- `email` is for the organizer only and is never shown on the site. It is required for
-- every new pledge; rows from before this change have none.
-- `anonymous` means the public list shows "Anonymous" with no handle, picture or link.
-- The organizer still sees who it is.

alter table public.pledges
  add column email text check (email is null or (char_length(email) between 3 and 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+$')),
  add column anonymous boolean not null default false;

create function public.replace_pledge(
  p_person uuid, p_name text, p_cents int, p_status text,
  p_kind text, p_company_url text, p_x_handle text,
  p_email text, p_anonymous boolean
) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  new_id uuid;
begin
  update public.pledges set status = 'hidden'
   where person_id = p_person and status in ('held', 'listed');
  insert into public.pledges (person_id, display_name, amount_cents, status, kind, company_url, x_handle, email, anonymous)
  values (p_person, p_name, p_cents, p_status, p_kind, p_company_url, p_x_handle, p_email, p_anonymous)
  returning id into new_id;
  return new_id;
end;
$$;

revoke execute on function public.replace_pledge(uuid, text, int, text, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.replace_pledge(uuid, text, int, text, text, text, text, text, boolean) to service_role;
