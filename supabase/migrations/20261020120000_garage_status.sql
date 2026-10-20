-- Per-vehicle Garage status set from admin: recommendations, paint correction, ceramic years.
begin;
alter table public.garage_vehicles
  add column if not exists paint_correction boolean not null default false,
  add column if not exists recommend_headlights boolean not null default false,
  add column if not exists recommend_paint_correction boolean not null default false,
  add column if not exists recommend_ceramic boolean not null default false,
  add column if not exists ceramic_years integer not null default 5 check (ceramic_years between 1 and 15);
notify pgrst, 'reload schema';
commit;
