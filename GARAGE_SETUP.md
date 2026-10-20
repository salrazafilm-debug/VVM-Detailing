# Customer Garage setup

This feature uses the current Next.js/Vercel site and the existing Supabase project. The root marketing site remains `public/index.html`; the Garage is served by Next.js at `/client-login`, `/garage`, and `/garage-admin`.

## 1. Supabase

1. In **SQL Editor**, run the updated `supabase/schema.sql` once. It adds Garage tables, read policies, the private `garage-photos` bucket, the account profile trigger, and the atomic service/cycle procedure while preserving booking holds and coupon records.
2. In **Authentication → URL Configuration**, set the Site URL to `https://www.vvmdetails.com` and add `https://www.vvmdetails.com/client-login`, `https://www.vvmdetails.com/reset-password`, and the active Vercel preview URLs to Redirect URLs. Customer invitations open the password setup page.
3. Create your own Supabase Auth user, copy its user UUID, then run `insert into public.garage_admins(user_id) values ('YOUR-USER-UUID');` in SQL Editor. Only this administrator can invite customers and maintain Garage records.
4. Confirm the `garage-photos` bucket is private. The schema creates it with a 4 MB WebP-only limit.

## 2. Vercel environment variables

Set these in the Vercel project. Keep the service key private and do not add it to any `NEXT_PUBLIC_` variable.

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SECRET_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_SITE_URL=https://www.vvmdetails.com`
- `BREVO_API_KEY`, `BREVO_MONTH1_TEMPLATE_ID`, `BREVO_MONTH3_TEMPLATE_ID`
- `CRON_SECRET` (a long random secret; Vercel sends it as the cron bearer token)
- `GARAGE_REMINDER_SECRET` (a separate long random secret used by the internal reminder sender)

Keep the existing Square and Resend variables for the booking flow. Redeployed Vercel functions pick up updated project variables.

## 3. Brevo templates and automation

Create two **transactional email templates** in Brevo and put their numeric template IDs in the matching Vercel variables. The templates are editable in Brevo. Use these template parameters:

- Both: `FIRSTNAME`, `VEHICLE`, `GARAGE_URL`, `BOOKING_URL`
- Month 1: `OFFER_DISCOUNT`, `OFFER_SAVINGS`, `OFFER_EXPIRATION_DATE`, `OFFER_CODE`
- Month 3: `SEALANT_ESTIMATED_END`

Suggested Month 1 subject: **Your vehicle is ready for maintenance**. Explain that the customer's vehicle has a Full Factory Reset available at 50% off, with over $145 in savings, and state `OFFER_EXPIRATION_DATE` as the final redemption date.

Suggested Month 3 subject: **Maintenance due — estimated Ceramic Sealant period complete**. Explain that the three-month sealant estimate has ended and invite the customer to book maintenance.

The Vercel cron calls `/api/garage/reminder` daily at 14:00 UTC. It finds only currently active cycles whose Month 1 or Month 3 dates have arrived, then sends the corresponding editable Brevo template. Supabase records one delivery per cycle and message type. A new qualifying detail supersedes the old cycle, so later cron runs skip its reminders. Vercel's daily schedule runs at 9:00 AM Eastern during standard time and 10:00 AM during daylight time.

## 4. Admin workflow

Existing databases: run `supabase/migrations/20261020004500_optional_vehicle_details.sql` once in the SQL Editor to allow unknown year/make. Existing vehicle records remain unchanged. New installations using `supabase/schema.sql` already include this update.

Open `/admin` to sign in, then use the client-first workspace at `/garage-admin`. Select a client by name (or create their login with a name, email and temporary password), then select one of their vehicles (or add a vehicle). Only the model is required; year and make are optional. New clients and vehicles are selected automatically. Upload photos next; the saved gallery refreshes after each upload. Share new client credentials privately; clients can use Forgot password to choose their own password.

Completed details, protection, appointments and the showroom photo studio are optional expandable sections for the selected vehicle. The client directory and dated history are below the workspace. Changing client or vehicle clears unsaved photo, service and appointment details. Mark **Paint Ceramic Sealant Applied** only for qualifying details; the other three protection selections default off. Photos are automatically resized and compressed before upload; HEIC is decoded in the browser when needed. The server validates and re-encodes image pixels as WebP, with a maximum 1800px long edge and no EXIF/GPS metadata, before storing them in the private bucket. No manual file conversion is required.

Recording a qualifying detail saves the service and starts a three-month cycle atomically. The Month 1 offer expiration is one calendar month after its offer date. Only Full Factory Reset sizes with a half-price saving greater than $145 appear in the offer code flow. The customer must use the invited email at booking. The offer is reserved during booking and redeemed once the booking request is accepted by the existing flow.

Upcoming appointments entered in Garage Admin are confirmed or requested appointments for the customer portal. The current public booking flow still emails requests for manual confirmation; it does not automatically sync Square bookings into Garage appointments.

## Delivery reconciliation

Only missing deliveries or definitive HTTP rejections are retried automatically. A timeout, network failure, provider 5xx, or failed acknowledgement remains `queued` with a review error. Check Brevo delivery logs before changing that record to `sent` or `failed`. This prevents blind retries after Brevo may already have accepted the email. The Brevo idempotency key is the delivery UUID; its provider window is finite. New cycle claims recheck the active cycle and business dates under database locks. A service reset after the final check may still overlap an email already being sent; externally delivered email cannot be recalled.
