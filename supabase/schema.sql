-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- Holds: times reserved on the site before the owner enters them in Square.
create table if not exists public.holds (
  key     text primary key,
  date    text not null,        -- local date, YYYY-MM-DD
  start   integer not null,     -- minutes after midnight, local time
  "end"   integer not null,
  kind    text not null,
  expires bigint not null       -- unix time in ms
);
create index if not exists holds_date_idx on public.holds (date);

-- Only the server (secret key) reads or writes this table. Locking it for everyone else:
alter table public.holds enable row level security;
