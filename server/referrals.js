// Referral codes, referral tracking and the 5th-referral reward. Every function takes a Supabase client that
// uses the SECRET key (server side only), so codes and other clients' details never reach the browser.
const { addMonths } = require('./garage-dates');

const GOAL = 5;                       // the 5th completed referral earns a free Full Factory Reset
const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.vvmdetails.com').replace(/\/$/, '');
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const normalizeCode = s => String(s || '').replace(/\s+/g, '').toUpperCase();
const firstName = n => String(n || '').trim().split(/\s+/)[0] || 'a friend';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O/1/I so codes are easy to read out loud
function makeCode(displayName) {
  const letters = String(displayName || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'VVM';
  let tail = '';
  for (let i = 0; i < 4; i++) tail += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return letters + tail;
}

// The client's referral code. Created the first time it is needed.
async function ensureReferralCode(db, userId, displayName) {
  const { data: row, error } = await db.from('garage_profiles').select('referral_code').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (row?.referral_code) return row.referral_code;
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = makeCode(displayName);
    // Codes must not clash with any other kind of code the site accepts.
    const [{ data: a }, { data: b }, { data: c }] = await Promise.all([
      db.from('discount_codes').select('code').eq('code', code).maybeSingle(),
      db.from('coupons').select('code').eq('code', code).maybeSingle(),
      db.from('garage_profiles').select('user_id').eq('referral_code', code).maybeSingle(),
    ]);
    if (a || b || c) continue;
    const { error: upErr } = await db.from('garage_profiles').update({ referral_code: code }).eq('user_id', userId);
    if (!upErr) return code;
  }
  throw new Error('Could not create a referral code.');
}

async function findReferrer(db, code) {
  const key = normalizeCode(code);
  if (!key) return null;
  const { data, error } = await db.from('garage_profiles').select('user_id,display_name,email').eq('referral_code', key).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { userId: data.user_id, name: data.display_name || '', email: data.email || '', code: key } : null;
}

// Progress for the Rewards tab.
async function rewardsFor(db, userId, displayName) {
  const code = await ensureReferralCode(db, userId, displayName);
  const { data: rows, error } = await db.from('referrals').select('status,rewarded,created_at').eq('referrer_user_id', userId);
  if (error) throw new Error(error.message);
  const completed = (rows || []).filter(r => r.status === 'completed').length;
  const pending = (rows || []).filter(r => r.status === 'pending').length;
  return { code, link: `${SITE()}/?coupon=${code}`, goal: GOAL, completed, pending, progress: completed % GOAL, earned: Math.floor(completed / GOAL) };
}

// Checks a referral code for a NEW client. Returns the referrer, or throws a message the customer can read.
async function checkReferral(db, code, refereeEmail) {
  const referrer = await findReferrer(db, code);
  if (!referrer) return null;
  const email = String(refereeEmail || '').trim().toLowerCase();
  if (email) {
    if (referrer.email && referrer.email.toLowerCase() === email) throw Object.assign(new Error('You cannot use your own referral code.'), { status: 400 });
    const { data: used } = await db.from('referrals').select('id').ilike('referee_email', email).neq('status', 'dismissed').limit(1);
    if (used && used.length) throw Object.assign(new Error('Referral codes are for new clients only.'), { status: 400 });
  }
  return referrer;
}

async function recordReferral(db, { referrer, name, email, bookingId }) {
  const { data, error } = await db.from('referrals').insert({ referrer_user_id: referrer.userId, code: referrer.code, referee_name: name || null, referee_email: String(email).trim().toLowerCase(), booking_id: bookingId || null }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id;
}

// The owner marks a booking completed: the referral (if any) counts, and the 5th one earns the free detail.
async function completeBooking(db, bookingId) {
  const { data: booking, error } = await db.from('booking_requests').select('id,status,referral_id,name').eq('id', bookingId).maybeSingle();
  if (error || !booking) throw Object.assign(new Error('Booking not found.'), { status: 404 });
  const wasCompleted = booking.status === 'completed';
  await db.from('booking_requests').update({ status: 'completed' }).eq('id', bookingId);
  const result = { referral: null, rewardGift: false, warning: null };
  if (!booking.referral_id || wasCompleted) return result;
  const { data: ref } = await db.from('referrals').select('*').eq('id', booking.referral_id).maybeSingle();
  if (!ref || ref.status !== 'pending') return result;
  await db.from('referrals').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', ref.id);
  const { count } = await db.from('referrals').select('id', { count: 'exact', head: true }).eq('referrer_user_id', ref.referrer_user_id).eq('status', 'completed');
  result.referral = { completed: count || 0 };
  if ((count || 0) % GOAL !== 0) return result;
  // 5th referral: a free Full Factory Reset, sent as a gift to the client's vehicle (it shows on their Bookings tab).
  const { data: vehicles } = await db.from('garage_vehicles').select('id,vehicle_size').eq('customer_id', ref.referrer_user_id).order('created_at', { ascending: true });
  const vehicle = (vehicles || []).find(v => v.vehicle_size) || (vehicles || [])[0];
  if (!vehicle) { result.warning = 'That client earned a free detail, but has no vehicle yet. Add a vehicle, then send the gift from their Garage health panel.'; return result; }
  const start = today();
  const { error: giftErr } = await db.from('garage_offers').insert({ vehicle_id: vehicle.id, cycle_id: null, title: 'Full Factory Reset', gift_from: 'VVM Details', discount_percent: 100, stated_savings_cents: 0, starts_on: start, expires_at: addMonths(start, 12), status: 'available' });
  if (giftErr) { result.warning = 'That client earned a free detail, but the gift could not be created. Send it by hand from their Garage health panel.'; return result; }
  await db.from('referrals').update({ rewarded: true }).eq('id', ref.id);
  result.rewardGift = true;
  return result;
}

module.exports = { GOAL, SITE, normalizeCode, firstName, ensureReferralCode, findReferrer, rewardsFor, checkReferral, recordReferral, completeBooking };
