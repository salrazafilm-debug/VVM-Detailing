-- Photo visibility + order on My Garage; showroom size per device.
begin;
alter table public.garage_photos
  add column if not exists show_on_garage boolean not null default true,
  add column if not exists sort_order integer not null default 0;
alter table public.garage_vehicles
  add column if not exists desktop_scale integer not null default 100 check (desktop_scale between 10 and 300),
  add column if not exists desktop_x integer not null default 50 check (desktop_x between -50 and 150),
  add column if not exists desktop_y integer not null default 58 check (desktop_y between -50 and 150),
  add column if not exists phone_scale integer not null default 100 check (phone_scale between 10 and 300),
  add column if not exists phone_x integer not null default 50 check (phone_x between -50 and 150),
  add column if not exists phone_y integer not null default 58 check (phone_y between -50 and 150);
notify pgrst, 'reload schema';
commit;
