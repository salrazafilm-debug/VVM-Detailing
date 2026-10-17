-- Customer Garage. Keep photos in a private Storage bucket; clients only read their own vehicle data.
begin;
create table if not exists public.garage_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.garage_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.garage_vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.garage_profiles(user_id) on delete cascade,
  year integer not null check (year between 1900 and 2200),
  make text not null,
  model text not null,
  color text,
  hero_photo_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists garage_vehicles_customer_idx on public.garage_vehicles(customer_id);

create table if not exists public.garage_services (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.garage_vehicles(id) on delete cascade,
  service_date date not null,
  title text not null,
  description text,
  paint_sealant boolean not null default false,
  ceramic_coating boolean not null default false,
  leather_protection boolean not null default false,
  fabric_protection boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists garage_services_vehicle_date_idx on public.garage_services(vehicle_id, service_date desc);

create table if not exists public.garage_maintenance_cycles (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.garage_vehicles(id) on delete cascade,
  service_id uuid not null references public.garage_services(id) on delete cascade,
  applied_on date not null,
  offer_date date not null,
  offer_expires_at date not null,
  sealant_expires_at date not null,
  status text not null default 'active' check (status in ('active','superseded','complete')),
  created_at timestamptz not null default now()
);
create unique index if not exists garage_one_active_cycle_per_vehicle on public.garage_maintenance_cycles(vehicle_id) where status = 'active';

create table if not exists public.garage_offers (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null unique references public.garage_maintenance_cycles(id) on delete cascade,
  vehicle_id uuid not null references public.garage_vehicles(id) on delete cascade,
  title text not null default 'Full Factory Reset',
  coupon_code text not null unique default ('VVM' || upper(replace(gen_random_uuid()::text,'-',''))),
  discount_percent integer not null default 50 check (discount_percent = 50),
  stated_savings_cents integer not null default 14500,
  starts_on date not null,
  expires_at date not null,
  status text not null default 'available' check (status in ('available','reserved','redeemed','expired','invalidated')),
  created_at timestamptz not null default now()
);

create table if not exists public.garage_photos (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.garage_vehicles(id) on delete cascade,
  storage_path text not null unique,
  caption text,
  photo_kind text not null default 'gallery' check (photo_kind in ('hero','before','after','gallery')),
  created_at timestamptz not null default now()
);
alter table public.garage_vehicles drop constraint if exists garage_vehicles_hero_photo_fk;
alter table public.garage_vehicles add constraint garage_vehicles_hero_photo_fk foreign key (hero_photo_id) references public.garage_photos(id) on delete set null;

create table if not exists public.garage_appointments (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.garage_vehicles(id) on delete cascade,
  starts_at timestamptz not null,
  service_label text not null,
  status text not null default 'confirmed' check (status in ('requested','confirmed','completed','cancelled')),
  square_booking_id text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.garage_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.garage_maintenance_cycles(id) on delete cascade,
  message_type text not null check (message_type in ('month1_offer','month3_due')),
  status text not null default 'queued' check (status in ('queued','sent','failed','cancelled')),
  provider_message_id text,
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique(cycle_id, message_type)
);

-- A row lock makes repeated cron invocations idempotent and retries failed deliveries later.
create or replace function public.garage_claim_email_delivery(p_cycle_id uuid, p_message_type text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_status text;
begin
  if auth.role() <> 'service_role' then raise exception 'Server authorization required'; end if;
  insert into public.garage_email_deliveries(cycle_id,message_type,status)
  values(p_cycle_id,p_message_type,'queued') on conflict(cycle_id,message_type) do nothing returning id into v_id;
  if v_id is not null then return v_id; end if;
  select id,status into v_id,v_status from public.garage_email_deliveries where cycle_id=p_cycle_id and message_type=p_message_type for update;
  if not found or v_status in ('sent','queued','cancelled') then return null; end if;
  update public.garage_email_deliveries set status='queued',error=null,created_at=now() where id=v_id and status='failed';
  return v_id;
end; $$;
revoke all on function public.garage_claim_email_delivery(uuid,text) from public,anon,authenticated;
grant execute on function public.garage_claim_email_delivery(uuid,text) to service_role;

create or replace function public.is_garage_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.garage_admins where user_id = auth.uid()); $$;

alter table public.garage_admins enable row level security;
alter table public.garage_profiles enable row level security;
alter table public.garage_vehicles enable row level security;
alter table public.garage_services enable row level security;
alter table public.garage_maintenance_cycles enable row level security;
alter table public.garage_offers enable row level security;
alter table public.garage_photos enable row level security;
alter table public.garage_appointments enable row level security;
alter table public.garage_email_deliveries enable row level security;

drop policy if exists garage_admin_self_read on public.garage_admins;
create policy garage_admin_self_read on public.garage_admins for select to authenticated using (user_id = auth.uid());
drop policy if exists garage_profile_self_read on public.garage_profiles;
create policy garage_profile_self_read on public.garage_profiles for select to authenticated using (user_id = auth.uid() or public.is_garage_admin());
drop policy if exists garage_vehicle_owner_read on public.garage_vehicles;
create policy garage_vehicle_owner_read on public.garage_vehicles for select to authenticated using (customer_id = auth.uid() or public.is_garage_admin());
drop policy if exists garage_service_owner_read on public.garage_services;
create policy garage_service_owner_read on public.garage_services for select to authenticated using (exists(select 1 from public.garage_vehicles v where v.id = vehicle_id and (v.customer_id = auth.uid() or public.is_garage_admin())));
drop policy if exists garage_cycle_owner_read on public.garage_maintenance_cycles;
create policy garage_cycle_owner_read on public.garage_maintenance_cycles for select to authenticated using (exists(select 1 from public.garage_vehicles v where v.id = vehicle_id and (v.customer_id = auth.uid() or public.is_garage_admin())));
drop policy if exists garage_offer_owner_read on public.garage_offers;
create policy garage_offer_owner_read on public.garage_offers for select to authenticated using (exists(select 1 from public.garage_vehicles v where v.id = vehicle_id and (v.customer_id = auth.uid() or public.is_garage_admin())));
drop policy if exists garage_photo_owner_read on public.garage_photos;
create policy garage_photo_owner_read on public.garage_photos for select to authenticated using (exists(select 1 from public.garage_vehicles v where v.id = vehicle_id and (v.customer_id = auth.uid() or public.is_garage_admin())));
drop policy if exists garage_appointment_owner_read on public.garage_appointments;
create policy garage_appointment_owner_read on public.garage_appointments for select to authenticated using (exists(select 1 from public.garage_vehicles v where v.id = vehicle_id and (v.customer_id = auth.uid() or public.is_garage_admin())));
drop policy if exists garage_delivery_owner_read on public.garage_email_deliveries;
create policy garage_delivery_owner_read on public.garage_email_deliveries for select to authenticated using (exists(select 1 from public.garage_maintenance_cycles c join public.garage_vehicles v on v.id = c.vehicle_id where c.id = cycle_id and (v.customer_id = auth.uid() or public.is_garage_admin())));

revoke all on public.garage_profiles, public.garage_vehicles, public.garage_services, public.garage_maintenance_cycles, public.garage_offers, public.garage_photos, public.garage_appointments, public.garage_email_deliveries, public.garage_admins from anon, authenticated;
grant select on public.garage_profiles, public.garage_vehicles, public.garage_services, public.garage_maintenance_cycles, public.garage_offers, public.garage_photos, public.garage_appointments, public.garage_email_deliveries, public.garage_admins to authenticated;
grant all on public.garage_profiles, public.garage_vehicles, public.garage_services, public.garage_maintenance_cycles, public.garage_offers, public.garage_photos, public.garage_appointments, public.garage_email_deliveries, public.garage_admins to service_role;

-- Customer profiles are provisioned by an auth trigger; clients receive read-only policies above.
create or replace function public.garage_new_profile()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  insert into public.garage_profiles(user_id,email,display_name)
  values(new.id, coalesce(new.email,''), coalesce(new.raw_user_meta_data->>'display_name',''))
  on conflict(user_id) do update set email = excluded.email;
  return new;
end; $$;
drop trigger if exists garage_auth_profile on auth.users;
create trigger garage_auth_profile after insert or update of email on auth.users for each row execute function public.garage_new_profile();

-- Atomically records a service and resets the vehicle's active sealant cycle.
create or replace function public.garage_record_service(
  p_vehicle_id uuid, p_service_date date, p_title text, p_description text,
  p_paint_sealant boolean, p_ceramic_coating boolean, p_leather_protection boolean, p_fabric_protection boolean
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_customer uuid; v_service uuid; v_cycle uuid; v_offer date; v_offer_end date; v_sealant_end date;
begin
  if auth.role() <> 'service_role' then raise exception 'Server authorization required'; end if;
  select customer_id into v_customer from public.garage_vehicles where id = p_vehicle_id for update;
  if v_customer is null then raise exception 'Vehicle not found'; end if;
  insert into public.garage_services(vehicle_id,service_date,title,description,paint_sealant,ceramic_coating,leather_protection,fabric_protection)
  values(p_vehicle_id,p_service_date,p_title,p_description,p_paint_sealant,p_ceramic_coating,p_leather_protection,p_fabric_protection) returning id into v_service;
  if p_paint_sealant then
    update public.garage_maintenance_cycles set status='superseded' where vehicle_id=p_vehicle_id and status='active';
    update public.garage_offers set status='invalidated' where vehicle_id=p_vehicle_id and status in ('available','reserved');
    v_offer := (p_service_date + interval '1 month')::date;
    v_offer_end := (v_offer + interval '1 month')::date;
    v_sealant_end := (p_service_date + interval '3 months')::date;
    insert into public.garage_maintenance_cycles(vehicle_id,service_id,applied_on,offer_date,offer_expires_at,sealant_expires_at)
    values(p_vehicle_id,v_service,p_service_date,v_offer,v_offer_end,v_sealant_end) returning id into v_cycle;
    insert into public.garage_offers(cycle_id,vehicle_id,starts_on,expires_at) values(v_cycle,p_vehicle_id,v_offer,v_offer_end);
  end if;
  return jsonb_build_object('service_id',v_service,'customer_id',v_customer,'cycle_id',v_cycle,'offer_date',v_offer,'offer_expires_at',v_offer_end,'sealant_expires_at',v_sealant_end);
end; $$;
revoke all on function public.garage_record_service(uuid,date,text,text,boolean,boolean,boolean,boolean) from public, anon, authenticated;
grant execute on function public.garage_record_service(uuid,date,text,text,boolean,boolean,boolean,boolean) to service_role;

-- Private object bucket. The backend signs customer photo URLs only after RLS-scoped ownership checks.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('garage-photos','garage-photos',false,4194304,array['image/webp'])
on conflict(id) do update set public=false, file_size_limit=4194304, allowed_mime_types=array['image/webp'];

drop policy if exists garage_photo_storage_owner_read on storage.objects;
create policy garage_photo_storage_owner_read on storage.objects for select to authenticated using (
  bucket_id='garage-photos' and exists(
    select 1 from public.garage_vehicles v where v.id::text=split_part(name,'/',1) and (v.customer_id=auth.uid() or public.is_garage_admin())
  )
);
commit;

