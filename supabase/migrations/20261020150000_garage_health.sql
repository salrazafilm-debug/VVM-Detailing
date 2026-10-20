-- Health tab: protection type, done ticks, what the client sees, and a per-client logo.
begin;
alter table public.garage_vehicles
  add column if not exists protection_type text check (protection_type in ('sealant','coating')),
  add column if not exists headlights_done boolean not null default false,
  add column if not exists show_headlights boolean not null default true,
  add column if not exists show_paint boolean not null default true,
  add column if not exists show_protection boolean not null default true,
  add column if not exists show_ceramic_rec boolean not null default true;
alter table public.garage_profiles add column if not exists logo_path text;
notify pgrst, 'reload schema';
commit;
