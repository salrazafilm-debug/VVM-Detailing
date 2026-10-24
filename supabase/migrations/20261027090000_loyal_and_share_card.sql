-- Loyal client badge (per client) and the share card style (per vehicle).
begin;
alter table public.garage_profiles add column if not exists loyal boolean not null default false;
alter table public.garage_vehicles add column if not exists share_style jsonb;
notify pgrst, 'reload schema';
commit;
