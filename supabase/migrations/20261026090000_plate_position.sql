-- Where the vehicle box sits on the Garage home screen, set by admin (% from left and top). Null = default place.
begin;
alter table public.garage_vehicles
  add column if not exists plate_phone_x integer check (plate_phone_x is null or plate_phone_x between 0 and 100),
  add column if not exists plate_phone_y integer check (plate_phone_y is null or plate_phone_y between 0 and 100),
  add column if not exists plate_desktop_x integer check (plate_desktop_x is null or plate_desktop_x between 0 and 100),
  add column if not exists plate_desktop_y integer check (plate_desktop_y is null or plate_desktop_y between 0 and 100);
notify pgrst, 'reload schema';
commit;
