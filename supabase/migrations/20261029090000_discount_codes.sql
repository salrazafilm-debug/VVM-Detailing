-- Discount codes made in the Garage admin: take dollars off any booking. Uses are counted in coupon_uses.
create table if not exists public.discount_codes (
  code text primary key,
  amount_cents integer not null check (amount_cents > 0),
  uses_limit integer not null check (uses_limit >= 1),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.discount_codes enable row level security;
notify pgrst, 'reload schema';
