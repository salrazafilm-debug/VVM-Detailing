-- Referral partners: people who are not clients. Name + custom code, tracked 0/5, free detail on the 5th.
begin;
create table if not exists public.referral_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  redeemed integer not null default 0 check (redeemed >= 0),
  created_at timestamptz not null default now()
);
create table if not exists public.partner_referrals (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.referral_partners(id) on delete cascade,
  booking_id uuid references public.booking_requests(id) on delete set null,
  referee_name text,
  referee_email text not null,
  status text not null default 'pending' check (status in ('pending','completed','dismissed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists partner_referrals_partner_idx on public.partner_referrals (partner_id, status);
create index if not exists partner_referrals_booking_idx on public.partner_referrals (booking_id);
alter table public.referral_partners enable row level security;
alter table public.partner_referrals enable row level security;
notify pgrst, 'reload schema';
commit;
