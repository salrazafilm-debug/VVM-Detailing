# Launch checklist for vvmdetails.com

Everything is built and tested. These steps need YOUR accounts, so they are the only things left.
Never paste tokens or passwords into a chat. Put them only in Netlify's settings.

## 1. Put the site on Netlify (free): DONE (repo imported)
1. Go to netlify.com and **Sign up with GitHub**.
2. **Add new site > Import an existing project > GitHub** and choose `salrazafilm-debug/VVM-Details`, branch `master`.
3. Leave every build setting as is (Netlify reads `netlify.toml`). Click **Deploy**.
4. When it finishes you get a free address like `something.netlify.app`. Open it on your phone.

## 2. Get booking requests by email ~2 min
Netlify > your site > **Forms** > `booking-request` > **Settings & notifications > Add notification > Email** > `vvm.detailing@gmail.com`.
(The form shows up here once the first deploy has finished. The only email that should receive requests is vvm.detailing@gmail.com.)

## 3. Connect Square so the calendar shows your real open times ~5 min
1. developer.squareup.com > sign in > **Applications** > **+** (new app, any name, e.g. "VVM Website").
2. Open the app > **Credentials** > switch to **Production** > copy the **Access token**.
3. In Netlify: **Site configuration > Environment variables > Add**:
   - `SQUARE_ACCESS_TOKEN` = (the token, mark as **secret**)
   - `SQUARE_ENV` = `production`
   - `BOOKING_MODE` = `request`
4. **Deploys > Trigger deploy > Deploy site**.
The booking section now shows live open days. Until the token is added it shows "Online booking is unavailable. Call or text us."

## 4. Fix your Square prices (the calendar reads Square, not the website)
In the Square Dashboard > Items & services > Service library:
- **Full Factory Reset > Mini-Van**: change the price to **$410** (website already shows $410).
- **Interior Reset**: add a variation **Truck**, price **$255** (same as SUV), duration 4 hrs, assigned to you, available for online booking.

## 5. Test it like a customer
Make one booking from your phone. Check: the email arrives, the time disappears for the next visitor, and the confirmation says "Your booking is now reserved!". Add it to Square yourself (Square sends its normal notifications).

## 6. Move your domain LAST
Do this only after step 5 passes. Right now vvmdetails.com and www.vvmdetails.com show your **old Squarespace site**, and they keep doing so until you switch.
1. Netlify > **Domain management > Add a domain** > `vvmdetails.com`. Make **vvmdetails.com** (no www) the primary, so www forwards to it.
2. Where the domain's DNS is managed (the domain looks registered at Squarespace Domains), change only two records, using the exact values Netlify shows you:
   - the main address (**A record**, host `@`): replace the Squarespace addresses with Netlify's
   - **www** (CNAME): point it at your `something.netlify.app` address
3. Leave every other record alone (especially any mail records). Do NOT transfer the domain and do NOT cancel the domain registration.
4. In Netlify, wait for the free HTTPS certificate (a few minutes), then open https://vvmdetails.com on your phone.
5. Only after the new site works, cancel the old Squarespace **website** plan (not the domain).
Old addresses like `/appointments` and `/services-store/...` already forward to the right spot on the new site (see `netlify.toml`).

## Email
- Booking requests arrive at **vvm.detailing@gmail.com** from Netlify. After your first test booking, if it is in Spam, open it and tap **Not spam**, then make a filter so mail from `formresponses@netlify.com` never goes to spam.
- vvmdetails.com has no email set up (no mail records, and the domain currently says it sends no mail). That is fine while you use the Gmail address.
- If you want an address like `hello@vvmdetails.com`: free forwarding into your Gmail, or Google Workspace (about $7 a month). If you will SEND from it, the domain's mail records (SPF/DKIM) must be updated first or messages get rejected. Ask Claude to walk you through it.
- The free Netlify plan allows about 100 booking requests a month.
- Customers see "Your booking is now reserved!" on screen. They do not get a confirmation email, so you reach out to confirm.

## Maintenance Plan
It is for returning clients only, so the website never offers it, even though it is bookable in Square. You book it by hand.

## Day to day
- A customer books > you get an email > add it in Square. Once it is in Square at the same start time the website's hold clears automatically. Unconfirmed holds clear after 3 days.
- Photos and video: drop files in `assets/uploads/` (see the README there).

## Booking rules (`netlify/lib/rules.js`)
7:00 AM to 2:00 PM starts every 30 min, no overlaps (Square durations + transition time), max 2 bookings a day or 3 when all are interior-only or exterior-only, ceramic coating takes the whole day, no new job ahead of an existing booking unless there are 5 free hours (`MIN_WINDOW_MIN`), any day of the week, 12 hours minimum notice, bookable up to a year ahead. Customers can add several services to one vehicle (times and prices add up) and book 2 vehicles on the same day, done back to back and counted as 2 bookings. For 3 or more vehicles the site shows Text and Email buttons instead. Headlight Restoration counts as a short job, and Square must show its real duration (about an hour).

## If you later want the site to create the booking in Square itself
That needs Square Appointments Plus/Premium AND write permission on the token. Set `BOOKING_MODE` = `square` and `DRY_RUN` = `false`. Test with `DRY_RUN` = `true` first.

## Working on it from your own computer
Clone the repo (`git clone https://github.com/salrazafilm-debug/VVM-Details`), open the folder in the Claude Desktop app, or run `claude remote-control` in a terminal inside the folder. `CLAUDE.md` in the repo gives Claude everything it needs to continue.

## Reviews (optional Google connection)
The Reviews section always shows the reviews in `reviews.json` (name, text, stars, optional car and date) and a "Leave a review" button. To also show your Google reviews and rating automatically, add two Netlify environment variables: `GOOGLE_PLACES_API_KEY` (a Google Cloud key with **Places API (New)** turned on, restricted to that API) and `GOOGLE_PLACE_ID` (your Google Business Profile place id). Put your Google review link in `reviews.json` as `googleReviewUrl`. Google's answer is cached for 6 hours so it costs almost nothing. The site shows every review Google returns (up to 5), with the Google rating and link.
