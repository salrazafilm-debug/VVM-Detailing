-- Location for each client (used for travel), shown on their booking screen.
begin;
alter table public.garage_profiles add column if not exists location text;
notify pgrst, 'reload schema';
commit;
