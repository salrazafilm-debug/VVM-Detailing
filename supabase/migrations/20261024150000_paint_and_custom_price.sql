-- Per-client custom reset price, optional paint correction (alone or bundled with the reset).
begin;
alter table public.garage_vehicles
  add column if not exists custom_price_cents integer check (custom_price_cents is null or custom_price_cents >= 0),
  add column if not exists paint_offer boolean not null default false,
  add column if not exists paint_price_cents integer check (paint_price_cents is null or paint_price_cents >= 0),
  add column if not exists bundle_price_cents integer check (bundle_price_cents is null or bundle_price_cents >= 0);
notify pgrst, 'reload schema';
commit;
