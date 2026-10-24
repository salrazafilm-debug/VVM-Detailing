-- Show or hide the vehicle name on the Garage home screen (default on).
begin;
alter table public.garage_vehicles add column if not exists show_vehicle_name boolean not null default true;
notify pgrst, 'reload schema';
commit;
