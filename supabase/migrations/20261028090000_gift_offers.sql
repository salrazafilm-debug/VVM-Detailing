-- Gift a detail: the owner gifts a free Full Factory Reset to one vehicle. Gifts reuse garage_offers
-- (100% off, no maintenance cycle). claimed_at is set when the client taps "Claim and save for later".
alter table public.garage_offers alter column cycle_id drop not null;
alter table public.garage_offers drop constraint if exists garage_offers_discount_percent_check;
alter table public.garage_offers add constraint garage_offers_discount_percent_check check (discount_percent in (50,100));
alter table public.garage_offers add column if not exists gift_from text;
alter table public.garage_offers add column if not exists claimed_at timestamptz;
