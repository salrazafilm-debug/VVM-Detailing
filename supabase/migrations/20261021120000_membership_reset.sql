-- Vehicle size for the membership Full Factory Reset (half off). Set in admin; clients see only their own size.
begin;
alter table public.garage_vehicles add column if not exists vehicle_size text check (vehicle_size in ('coupe','sedan','suv','truck','minivan'));
notify pgrst, 'reload schema';
commit;
