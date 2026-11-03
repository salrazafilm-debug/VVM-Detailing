-- Auto-Garage: confirming a booking makes the client's Garage (off until the owner turns it on).
begin;
-- Existing clients stay ON. Garages made from bookings are saved OFF.
alter table public.garage_profiles add column if not exists garage_enabled boolean not null default true;
-- Set when the "your Garage is ready" email has been sent. Clients that already exist count as invited
-- (only on the first run, so a re-run never marks a new client as invited).
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='garage_profiles' and column_name='garage_invited_at') then
    alter table public.garage_profiles add column garage_invited_at timestamptz;
    update public.garage_profiles set garage_invited_at = created_at;
  end if;
end $$;
-- The address the client typed when booking (admin only) and the Garage login made from the booking.
alter table public.booking_requests add column if not exists address text;
alter table public.booking_requests add column if not exists garage_user_id uuid;
notify pgrst, 'reload schema';
commit;
