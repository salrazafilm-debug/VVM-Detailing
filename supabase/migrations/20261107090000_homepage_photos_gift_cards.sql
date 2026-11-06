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
create index if not exists gift_cards_pending_idx on public.gift_cards(status, created_at);
alter table public.gift_cards enable row level security;
notify pgrst, 'reload schema';
commit;
