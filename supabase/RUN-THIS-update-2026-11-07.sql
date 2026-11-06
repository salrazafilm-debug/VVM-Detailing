-- VVM Details: everything new since 2026-11-03. Paste ALL of this into Supabase > SQL Editor and press Run. Safe to run more than once.

-- Auto-Garage: confirming a booking makes the client's Garage (off until the owner turns it on).
begin;
-- Existing clients stay ON. Garages made from bookings are saved OFF.
alter table public.garage_profiles add column if not exists garage_enabled boolean not null default true;
-- Set when the "your Garage is ready" email has been sent. Clients that already exist count as invited
-- (only on the first run, so a re-run never marks a new client as invited).
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='garage_profiles' and column_name='garage_invited_at') then
    alter table public.garage_profiles add column garage_invited_at timestamptz;
    update public.garage_profiles set garage_invited_at = created_at;
  end if;
end $$;
-- The address the client typed when booking (admin only) and the Garage login made from the booking.
alter table public.booking_requests add column if not exists address text;
alter table public.booking_requests add column if not exists garage_user_id uuid;
notify pgrst, 'reload schema';
commit;

-- Review requests: remember when the "How did we do?" email was sent for a booking.
begin;
alter table public.booking_requests add column if not exists review_sent_at timestamptz;
notify pgrst, 'reload schema';
commit;

-- Homepage photos (admin > Homepage) and gift cards.
begin;
-- The confirmed "Our Work" list. One row, id 'home'. Only the server (service role) reads or writes it.
create table if not exists public.site_gallery (
  id text primary key,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.site_gallery enable row level security;
-- Public bucket for homepage photos (WebP, made small by the server). Anyone can view; only the server uploads.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('site-photos','site-photos',true,5242880,array['image/webp'])
on conflict(id) do update set public=true, file_size_limit=5242880, allowed_mime_types=array['image/webp'];
-- Gift cards bought with a Square payment link. The code is made once the payment is seen.
create table if not exists public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  token text not null,
  amount_cents integer not null check (amount_cents > 0),
  buyer_name text not null,
  buyer_email text not null,
  to_name text,
  to_email text,
  message text,
  status text not null default 'pending' check (status in ('pending','paid')),
  code text,
  square_order_id text,
  square_link_id text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
-- What the gift is for, e.g. "Full Factory Reset (SUV)" (empty for an amount).
alter table public.gift_cards add column if not exists label text;
create index if not exists gift_cards_pending_idx on public.gift_cards(status, created_at);
alter table public.gift_cards enable row level security;
notify pgrst, 'reload schema';
commit;
