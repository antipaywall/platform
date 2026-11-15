-- "My tools": the catalog tools a signed-in person says they pay for today. It is how the site
-- learns which paid tools people want replaced (onboarding and the MCP's my_tools write it).
-- Kept in its own table, apart from signals: "I'd pay if it worked" is a different statement with
-- an amount attached, and this must never inflate it. Tools looked up by their website are counted
-- in asked_tools.askers instead. Additive: one new table, nothing else changes.

create table public.paid_tools (
  person_id uuid not null references public.people (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (person_id, product_id)
);
create index paid_tools_product on public.paid_tools (product_id);

alter table public.paid_tools enable row level security;
revoke all on public.paid_tools from anon, authenticated;
