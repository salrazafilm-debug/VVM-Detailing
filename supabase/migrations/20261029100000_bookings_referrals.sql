-- Booking requests (a record of every request; the email to the owner still goes out first), referral codes and referrals.
alter table public.garage_profiles add column if not exists referral_code text unique;

create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  phone text,
  zip text,
  drop_off boolean not null default false,
  travel_fee_cents integer not null default 0,
  discount_label text,
  discount_cents integer not null default 0,
  total_cents integer,
  vehicles text,
  services text,
  booking_date date not null,
  booking_time text not null,
  coupon text,
  gift boolean not null default false,
  marketing_opt_in boolean not null default false,
  status text not null default 'requested' check (status in ('requested','confirmed','completed','cancelled')),
  reminder_sent_at timestamptz,
  referral_id uuid
);
create index if not exists booking_requests_date_idx on public.booking_requests (booking_date);
alter table public.booking_requests enable row level security;

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  referrer_user_id uuid not null references public.garage_profiles(user_id) on delete cascade,
  code text not null,
  referee_name text,
  referee_email text not null,
  booking_id uuid references public.booking_requests(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','completed','dismissed')),
  rewarded boolean not null default false,
  completed_at timestamptz
);
-- A new client can only be referred once.
create unique index if not exists referrals_one_per_referee on public.referrals (lower(referee_email)) where status <> 'dismissed';
create index if not exists referrals_referrer_idx on public.referrals (referrer_user_id);
alter table public.referrals enable row level security;
notify pgrst, 'reload schema';
