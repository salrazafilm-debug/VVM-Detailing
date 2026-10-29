// Travel fee, family area and the "one discount per booking" rule, in ONE place so the homepage,
// the Garage and the server always agree. Drive times are ESTIMATES by ZIP code (see travel-zips.json,
// built from public ZIP centroids). To correct a ZIP, add it to OVERRIDE_MINUTES. The home street address is
// never used here and never leaves the server.
const ZIPS = require('./travel-zips.json');

const HOME = { street: '3412 Hillside Pl', city: 'Chesapeake Beach', state: 'MD', zip: '20732' };
const MAX_MINUTES = 70;                 // farther than this is not booked online (text or email us)
const FAMILY_DISCOUNT_CENTS = 3000;     // $30 off for the family area
const REFERRAL_DISCOUNT_CENTS = 2000;   // $20 off a Full Factory Reset for a new client with a referral code
// Family area ZIP codes (about 15 to 20 minutes from home). They never pay a travel fee.
const FAMILY_ZIPS = ['20732', '20714', '20639', '20657', '20736', '20754', '20678', '20685'];
// ZIP codes whose drive time the estimate gets wrong. Example: '20601': 55
const OVERRIDE_MINUTES = {};

// 30 min or less: free. 31 to 45: $20. 46 to 49: $25. 50 to 70: $30.
function travelFeeCents(minutes) {
  if (minutes <= 30) return 0;
  if (minutes <= 45) return 2000;
  if (minutes <= 49) return 2500;
  return 3000;
}

const cleanZip = z => String(z || '').replace(/\D/g, '').slice(0, 5);

// What a ZIP code means for a booking. ok:false has a message to show; known:false = we have no data for it.
function lookupZip(zipRaw) {
  const zip = cleanZip(zipRaw);
  if (zip.length !== 5) return { ok: false, known: false, message: 'Enter a 5-digit ZIP code.' };
  const row = ZIPS[zip];
  const family = FAMILY_ZIPS.includes(zip);
  if (!row && !family) return { ok: false, known: false, zip, message: 'We do not have that ZIP code yet. Please text (240) 601-9451 or email us and we will set up your day.' };
  const city = row ? row[1] : '', state = row ? row[2] : 'MD';
  let minutes = OVERRIDE_MINUTES[zip] ?? (row ? row[0] : 20);
  if (family) minutes = Math.min(minutes, 25);
  if (minutes > MAX_MINUTES) return { ok: false, known: true, tooFar: true, zip, city, state, minutes, message: 'That is a little farther than we can book online. Please text (240) 601-9451 or email us and we will see what we can do.' };
  return { ok: true, known: true, zip, city, state, minutes, feeCents: family ? 0 : travelFeeCents(minutes), family };
}

// One discount per booking: the biggest one wins. candidates: { kind, label, cents }
function bestDiscount(candidates) {
  const real = candidates.filter(c => c && c.cents > 0);
  if (!real.length) return null;
  return real.reduce((a, b) => (b.cents > a.cents ? b : a));
}

// Everything the customer pays, in cents. fee is not discounted.
function priceBooking({ servicesCents, feeCents = 0, discount = null }) {
  const off = Math.min(servicesCents, discount ? discount.cents : 0);
  return { servicesCents, feeCents, discountCents: off, totalCents: Math.max(0, servicesCents - off) + feeCents };
}

module.exports = { HOME, MAX_MINUTES, FAMILY_DISCOUNT_CENTS, REFERRAL_DISCOUNT_CENTS, FAMILY_ZIPS, travelFeeCents, lookupZip, bestDiscount, priceBooking, cleanZip };
