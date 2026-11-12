-- A pledge can be from a person or from a company, and can carry an X username the
-- pledger typed in. Neither is verified, so the site labels the X link as self-reported
-- and holds every company pledge for a manual check before it is listed.

alter table public.pledges
  add column kind text not null default 'individual' check (kind in ('individual', 'company')),
  add column company_url text check (company_url is null or (company_url ~ '^https://' and char_length(company_url) <= 200)),
  add column x_handle text check (x_handle is null or x_handle ~ '^[A-Za-z0-9_]{1,15}$');

drop function public.replace_pledge(uuid, text, int, text);

create function public.replace_pledge(
  p_person uuid, p_name text, p_cents int, p_status text,
  p_kind text, p_company_url text, p_x_handle text
) returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  update public.pledges set status = 'hidden'
   where person_id = p_person and status in ('held', 'listed');
  insert into public.pledges (person_id, display_name, amount_cents, status, kind, company_url, x_handle)
  values (p_person, p_name, p_cents, p_status, p_kind, p_company_url, p_x_handle);
end;
$$;

revoke execute on function public.replace_pledge(uuid, text, int, text, text, text, text) from public, anon, authenticated;
grant execute on function public.replace_pledge(uuid, text, int, text, text, text, text) to service_role;
