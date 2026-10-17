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

-- Coupon uses: one row per completed coupon booking. A code stops working after its limit (see server/coupons.js).
create table if not exists public.coupon_uses (
  id         bigserial primary key,
  code       text not null,
  created_at timestamptz not null default now()
);
create index if not exists coupon_uses_code_idx on public.coupon_uses (code);
alter table public.coupon_uses enable row level security;
