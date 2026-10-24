-- Crop for each saved photo (fractions of the original). The cropped copy lives in display_path.
begin;
alter table public.garage_photos add column if not exists crop jsonb;
alter table public.garage_vehicles add column if not exists recommend_paint_correction boolean not null default false;
notify pgrst, 'reload schema';
commit;
