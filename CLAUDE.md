# VVM Details: project guide for Claude

Website for **VVM Details**, a mobile car wash and detailing business (Chesapeake Beach, MD; serves DC, MD, VA).
Owner is non-technical and works from their phone. Keep explanations short and plain. Do the work, then say what changed.
Never put tokens or secrets in the repo or in chat. Never write to the owner's Square account without them confirming the exact change.

## Files
- `index.html`, `styles.css`, `main.js`: the whole site (one page). `privacy.html`, `404.html`, `robots.txt`, `sitemap.xml`.
- `assets/` images (currently low-res crops from screenshots; owner will send originals). `assets/uploads/` is where owner photos/videos go, see its README. Slots load only when the "Photos & Video" tab opens.
- `app/api/` routes call `server/handlers/` (`services.js`, `availability.js`, `book.js`, `reviews.js`, `coupon.js`). `server/` holds `rules.js` (booking rules), `square.js`, `holds.js`, `coupon-db.js`, `mail.js`.
- `SETUP.md`: launch checklist for the owner. `drafts/terms-draft.md`: terms draft, not public. `tests/` run with `npm test`.

## Look and feel (the owner is picky; follow these)
- Page background pink `#e9b3b3`. Logo colors: blue `#4f8ff0`, yellow `#f0d63c`, red `#e4572e`. Dark ink `#1a1214`.
- Fonts: Montserrat italic 800/900 for headings, Manrope for body. Headings tight and bold. Key words in CAPS and bold.
- Copy tone: short, confident, happy, "love". Fewer words, more impact. Wide lines, not tall narrow columns.
- **Holographic text must loop seamlessly**: gradient tile is 200% wide made of two identical cycles that start and end on the same color, animated `background-position 0% -> 200%` (`@keyframes holoFlow`). Never use a keyframe that jumps back (the owner saw it "turn off and on").
- **No mouse-follow tilt, zoom or distortion on cards.** Hover on buttons lifting slightly is fine.
- Service cards in this order: Full Factory Reset (gold, #1, crown badge, holographic border; its 4 photos are the ORIGINAL Lexus shots `lexus-front/dash/seats/grass.jpg`, the owner likes them, do not swap), Interior Reset (photo is the owner's red-and-black Mercedes AMG interior, saved as `amg-interior.jpg`; the owner chose it, do not swap), Exterior Reset, then Headlight Restoration and Engine Bay Detail side by side (standard cards; Headlight has a Before/After split header from `assets/uploads/headlight-before.jpg` / `headlight-after.jpg`, Engine Bay uses `engine-bay.jpg` and is quote-only like Boat), then Boat Detailing as a full-width `.wide` card (`boat-sea-hunt.jpg` + `boat-interior.jpg`) so it carries the same weight as the ceramic card, Paint Enhancement + Ceramic (diamond card, last). Headlight shows $135 from Square's bookable item and its button is Book my day (it IS bookable online, alone or added to another service). Boat Detailing has no prices: its buttons are Text for a quote (sms) and Email us, because boats are quoted. The Boat copy is a first draft the owner has not confirmed (services offered, areas, pricing) so ask before adding specifics.
  - Gold card: photos must stay untinted. Title is the biggest text on the card, "SAVE HUGE $$$" must stay clearly smaller. "PH-balanced" always capital PH. Checklist rows share one check style and align exactly.
  - **Phones (600px and under) must stay compact**: Full Factory Reset shows a photo strip, a badge row and a 3-line summary (`.bundle-line`) instead of the checklist; the diamond card uses short text (`.d-short`) and 4 sizes in one row. Keep both under about 700px tall at 390px wide (they were 1209 and 985). Measure before and after.
  - Size pills flip on tap to show price. No "From $" pricing.
  - Diamond card "More info" flips to a tabbed guide. Any grid must not leave an orphan last row at any width (audit widths 340 to 1280).
- Book Now section: dark star-sky stage, single yellow glowing title (no rainbow), gold line along the top edge. Footer continues the dark sky.
- Button text is bold, all caps. Booking button says "Book my day".
- Do not show the street address (it is a home address). Phone (240) 601-9451, email vvm.detailing@gmail.com, Instagram @vvm.details.

## Photos (owner's originals are on their PC)
- Originals: `D:\PHOTO Folders\VVM Photos` (folder access was granted to Claude on 2026-10-11). Phone photos CARRY GPS LOCATION in their metadata, and some show house numbers or boat registration numbers. Before any photo goes in `assets/`: re-save it with Pillow keeping only pixels (apply the phone rotation first, never pass `exif=`), resize to about 1300 px on the long side at JPEG quality ~78, crop out house numbers, and blur boat/vehicle registration numbers. Verify no file contains Exif/GPS before committing. Never commit the originals.
- Our Work gallery is 3 columns (2 on phones) of 20 photos at their natural shapes. `main.js` (end of file) balances the columns and trims ONLY the last photo of taller columns so all columns end on the same line. Add photos with a `<figure class="reveal"><img ... width height loading="lazy"></figure>` line; width/height MUST be the file's real size. `gal-*.jpg` are tight crops (sky/pavement trimmed so the whole car stays in) made from the web-size images. The four Full Factory Reset photos were given a bit more gloss and color (S-curve, +saturation, local contrast) from the originals; the photo column on that card is wider (1fr / 1.15fr) and on phones the grid is 3:4 so the cars fit.
- Used so far: hero collage (red Camry seats, white Lexus IS, Mini Cooper S cropped below the roofline because a house number "5900" is at the top of the original, white Mercedes C), gallery (Mini, red seats, wheel-washing action shot, white Mercedes, Audi TT, F-250), paint card (Audi TT), banner (Mercedes C interior). Not used on purpose: the Mercedes GLS steering wheel photo (other cars' plates in the background), a second near-duplicate Mini photo.

## Reviews
- The old "Every client. Every car." banner was replaced by a Reviews section (`#reviews`, in the menu and footer). Reviews come from `reviews.json` (owner's own: name, text, rating, optional car/when; plus `googleReviewUrl`) and, once connected, Google via `server/handlers/reviews.js` (`GOOGLE_PLACES_API_KEY` + `GOOGLE_PLACE_ID` env vars, 6 hour cache, fails open, shows every review Google returns, no cherry-picking). `reviews.json` holds 15 REAL Google reviews (Nomi's was dropped at the owner's request) copied from the owner's Google listing on 2026-10-11 (verbatim, names shortened, cut-off ones keep their ellipsis; the owner asked to drop the ones naming Tony/Anthony and keep ones that name Bruce or are short and sweet), each with that customer's car photo (`assets/reviews/*.jpg`, 800x600 crops, metadata-free; Jorge's is the owner's own Audi TT photo). The customers' photos came from their Google reviews on the owner's own listing at the owner's request; remove any on request. The cars wear the VVM plate frame; Nicole's photo is cropped to hide a real plate. Reviews show as a big endless carousel: 3 cards on desktop, 2 on tablets, 1 on phones. Three cloned sets drift ~42 px/s forever (rAF, jumps back one set invisibly); arrows, swipe and keys still work and briefly pause the drift; drift off for reduced motion. Rating snapshot 5.0 / 38 and the owner's review link (`https://g.page/r/CUdllaKYonfeEBM/review`; listing `https://maps.google.com/?cid=16030460175094998343`) are in the file. Never invent reviews. The snapshot goes stale: refresh it, or connect the live Google feed (needs the Places API place id, not the cid).
- Booking: the vehicle box comes first, then 'Booking for more than 1 vehicle?' Yes/No; Yes opens 1 / 2 / 3 or more, No folds it away completely.

## Booking system
- The first row for each vehicle is its year, make and model; Confirm locks it in (Edit unlocks it) and only then do the services appear. The details step no longer asks for vehicles. The preview trick: services/availability/book can be faked in a throwaway `_demo.html` (copy of index.html with a `window.VVM_API` mock before main.js); delete it before committing.
- Customers pick one or more services per vehicle (a cart: tap + on any size, tap again to remove), and say how many vehicles: 1, 2 or 3+. 2 vehicles = two bookings the same day, back to back (each vehicle can have its own services). 3+ vehicles are never booked online: the page shows Text / Email buttons. Rules for carts live in `resolvePlan` in `server/rules.js` (ceramic stands alone; Full Factory Reset cannot be combined with Interior/Exterior; each service once per vehicle; max 4 services per vehicle). A vehicle's services are combined into one job (durations add; interior + exterior together count as a full detail). API: `/availability?plan=A.B,C&month=YYYY-MM` (comma = next vehicle, dot = another service on the same vehicle) and `/book` with `plan` (array of arrays of ids) and `vehicles` (array of text). The email lists both vehicles and the total.
- Customers pick day, time. The calendar reads real bookings from Square (read-only) and applies `server/rules.js`:
  starts 7:00 AM to 2:00 PM every 30 min; no overlaps (Square duration + transition); max 2 bookings per day (3 only if all are interior-only or exterior-only);
  ceramic coating takes the whole day; no job squeezed before an existing booking unless 5+ free hours (`MIN_WINDOW_MIN`); any weekday; 12 h notice; up to a year ahead.
- Order in `book.js` matters: email first, hold second; fail loudly, never silently.
- When a booking goes through the customer sees a big celebration screen (confetti, gold check, giant "YAY!", "You're all booked and ready!", "Your booking is now reserved.") in `#book .yay` styles; keep that wording and the reduced-motion fallback. No deposit; payment after the service.
- Env vars (Vercel only): `SQUARE_ACCESS_TOKEN`, `SQUARE_ENV=production`, `BOOKING_MODE=request`.

## Square facts
- Location ID `L6GQ2NMD5YF1H`, timezone America/New_York, one team member (the owner). Prices and durations come from Square's service library, which is the source of truth.
- The Square connector available to Claude is read-only for the catalog (`ITEMS_WRITE` was refused). Reconnecting it with write access is the owner's step.
- **Maintenance Plan** (clients only) is hidden from the website on purpose: `isPublic()` in `server/square.js` filters it out of `services`, `availability` and `book`. It still blocks time as a 'full' job. Headlight Restoration and Engine Bay are 'other' and never shown.
- Square has TWO items named Headlight Restoration: a bookable appointment service ($135, 45 min, the one the site shows) and an older plain product ($100, not bookable). The owner may want to delete the old one. Headlight has its own kind `headlight` in `kindOf`; it is bookable online and counts as a short job (3 a day allowed when every job is short). Square lists it as 45 min but the owner says it takes an hour: the owner must change the duration in Square (the site always uses Square's duration).
- Square `price_description` text on some variations is stale (for example Paint Enhancement says $725/$1050); the real `price_money` is what the site uses and it matches.

## Domain and email facts (checked 2026-10-11)
- vvmdetails.com points at **Vercel** (apex A record 216.198.79.1, www CNAME to Vercel). DNS is managed at Squarespace Domains, but the domain is registered there too: keep the name servers and never touch the registration.
- No MX records. SPF is `v=spf1 -all` and DMARC is `p=reject`, so the domain sends and receives no mail. Any `@vvmdetails.com` mailbox or sending needs MX plus an SPF/DKIM update first.
- The 404 page uses root-relative links, so it works at any depth. Keep it that way.

## Open items (as of 2026-10-11)
1. Square catalog: DONE by the owner on 2026-10-11. Full Factory Reset Mini-Van is $410. Interior Reset has Sedan $235 and one combined **SUV / Truck** option at $255, 4 hrs (no separate Truck variation). The site card mirrors this. The calendar reads Square, so keep the two in step.
3. Terms page: `terms.html` is built (linked from footers, sitemap and the booking consent line) from the safe defaults in `drafts/terms-draft.md`, and the owner approved it as written on 2026-10-11 (sections 5, 6 and 10 included; section 10 was not legally reviewed). Service times and start times are left out because the booking flow shows them. Payment methods, water/power, late fees, warranty and coating aftercare days are deliberately NOT stated; add them only if the owner answers those `[YOUR CALL]` items.
4. The ceramic "Photos & Video" tab shows exactly one video (`assets/uploads/ceramic-video.mp4`, muted autoplay loop, GPS stripped) and one photo (`assets/ceramic-correction.jpg`, paint correction test spot); the owner wants only those two. Swap in the owner's originals for other screenshot-crop photos when sent.
5. Ideas not done: customer reviews section, Google Business link, analytics (would require updating privacy.html).

## Working here
- Run `npm test` before pushing. Check phone width (about 390px) and desktop (1280px). Keep `prefers-reduced-motion` support.
