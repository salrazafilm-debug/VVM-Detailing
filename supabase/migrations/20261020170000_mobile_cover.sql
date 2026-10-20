-- Second cover photo shown on phones (desktop keeps hero_photo_id).
begin;
alter table public.garage_vehicles add column if not exists mobile_hero_photo_id uuid references public.garage_photos(id) on delete set null;
notify pgrst, 'reload schema';
commit;
