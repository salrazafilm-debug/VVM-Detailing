-- Review requests: remember when the "How did we do?" email was sent for a booking.
begin;
alter table public.booking_requests add column if not exists review_sent_at timestamptz;
notify pgrst, 'reload schema';
commit;
