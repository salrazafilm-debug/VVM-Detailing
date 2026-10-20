-- Keep existing vehicle records; allow an unknown year and/or make.
begin;
alter table public.garage_vehicles
  alter column year drop not null,
  alter column make drop not null;
notify pgrst, 'reload schema';
commit;
