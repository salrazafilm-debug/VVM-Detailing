# VVM Details: setup checklist

The site runs on **Vercel** (hosting, pushes to `main` deploy automatically) and **Supabase** (database).
Never paste keys or passwords into chat. Put them only in Vercel's **Environment Variables**.

## Vercel environment variables
| Name | What it is |
|---|---|
| `SQUARE_ACCESS_TOKEN` | Square production token |
| `SQUARE_ENV` | `production` |
| `BOOKING_MODE` | `request` |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SECRET_KEY` | Supabase secret key (server only) |
| `RESEND_API_KEY` | Resend key for booking emails |
| `BOOKING_TO` | `vvm.detailing@gmail.com` |
| `BOOKING_FROM` | sender, for example `VVM Details <onboarding@resend.dev>` |

Optional: `GOOGLE_PLACES_API_KEY` and `GOOGLE_PLACE_ID` (live Google reviews).

## Supabase
- Run `supabase/schema.sql` once in the SQL Editor (holds, coupon uses, coupons).
- Customer coupons: add a row in **Table Editor > coupons**. No code change needed.
- The Garage: see [GARAGE_SETUP.md](GARAGE_SETUP.md).

## Booking emails
Requests go to vvm.detailing@gmail.com from Resend. If they land in Spam, mark them **Not spam** once.

## Domain
vvmdetails.com is connected in Vercel (**Settings > Domains**). Don't change the name servers.

## Tests
`npm test` runs the booking, coupon, review and Garage tests.
