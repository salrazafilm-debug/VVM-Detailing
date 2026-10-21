-- Smaller display copy of each photo, served to clients for faster loading. The original stays as storage_path.
begin;
alter table public.garage_photos add column if not exists display_path text;
notify pgrst, 'reload schema';
commit;
