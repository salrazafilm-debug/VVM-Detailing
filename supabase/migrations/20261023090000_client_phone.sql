-- Phone number for each client, used by their Garage booking.
begin;
alter table public.garage_profiles add column if not exists phone text;
notify pgrst, 'reload schema';
commit;
