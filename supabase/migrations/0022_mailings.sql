-- Emails the organizer writes once and sends to the email list: to everyone on it, or only to the
-- builders on it. Only people who are on the list and have not unsubscribed ever get one, each with
-- their own unsubscribe link. mailing_sends records who got which, so sending again never reaches
-- the same person twice. Additive: two new tables, nothing else changes.

create table public.mailings (
  id uuid primary key default gen_random_uuid(),
  subject text not null check (char_length(subject) between 1 and 150),
  body text not null check (char_length(body) between 1 and 20000),
  audience text not null check (audience in ('builders', 'list')),
  created_by uuid references public.people (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- When a test copy last went to the organizer. Sending needs a test after the last edit.
  tested_at timestamptz,
  -- When the send finished reaching everyone it was meant for.
  sent_at timestamptz
);

create table public.mailing_sends (
  mailing_id uuid not null references public.mailings (id) on delete cascade,
  subscriber_id uuid not null references public.subscribers (id) on delete cascade,
  resend_id text,
  sent_at timestamptz not null default now(),
  primary key (mailing_id, subscriber_id)
);

alter table public.mailings enable row level security;
revoke all on public.mailings from anon, authenticated;
alter table public.mailing_sends enable row level security;
revoke all on public.mailing_sends from anon, authenticated;
