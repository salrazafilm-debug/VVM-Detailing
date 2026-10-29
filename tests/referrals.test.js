const assert = require('node:assert/strict');
const referrals = require('../server/referrals');
const customerMail = require('../server/customer-mail');

// A tiny in-memory stand-in for Supabase: enough for the referral and reminder code.
function fakeDb(tables) {
  return { from(name) {
    const rows = tables[name] || (tables[name] = []);
    let filters = [], op = 'select', payload = null, head = false, lim = null;
    const q = {
      select(_c, o) { head = !!(o && o.head); return q; },
      eq(k, v) { filters.push(r => r[k] === v); return q; },
      neq(k, v) { filters.push(r => r[k] !== v); return q; },
      ilike(k, v) { filters.push(r => String(r[k]).toLowerCase() === String(v).toLowerCase()); return q; },
      is(k, v) { filters.push(r => (v === null ? r[k] == null : r[k] === v)); return q; },
      in(k, vs) { filters.push(r => vs.includes(r[k])); return q; },
      order() { return q; }, limit(n) { lim = n; return q; },
      insert(v) { op = 'insert'; payload = v; return q; }, update(v) { op = 'update'; payload = v; return q; },
      maybeSingle() { return run(true); }, single() { return run(true); }, then(a, b) { return run(false).then(a, b); },
    };
    async function run(single) {
      if (op === 'insert') { const defaults = name === 'referrals' ? { status: 'pending', rewarded: false } : {}; const row = { id: 'r' + Math.random().toString(36).slice(2), ...defaults, ...payload }; rows.push(row); return { data: single ? row : [row], error: null }; }
      let m = rows.filter(r => filters.every(f => f(r)));
      if (op === 'update') { m.forEach(r => Object.assign(r, payload)); return { data: single ? m[0] || null : m, error: null }; }
      if (lim) m = m.slice(0, lim);
      if (head) return { count: m.length, data: null, error: null };
      return { data: single ? m[0] || null : m, error: null, count: m.length };
    }
    return q;
  } };
}

(async () => {
  const T = { garage_profiles: [{ user_id: 'u1', display_name: 'Kim Lee', email: 'kim@x.com', referral_code: null }], garage_vehicles: [{ id: 'v1', customer_id: 'u1', vehicle_size: null, created_at: 1 }, { id: 'v2', customer_id: 'u1', vehicle_size: 'suv', created_at: 2 }] };
  const db = fakeDb(T);

  // Each client gets one code, made once, easy to read (no 0/O/1/I)
  const code = await referrals.ensureReferralCode(db, 'u1', 'Kim Lee');
  assert.match(code, /^KIM[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(await referrals.ensureReferralCode(db, 'u1', 'Kim Lee'), code, 'the same code every time');
  assert.equal((await referrals.findReferrer(db, ` ${code.toLowerCase()} `)).userId, 'u1', 'codes are found loosely');
  assert.equal(await referrals.findReferrer(db, 'NOPE'), null);

  // New clients only: not your own code, and a person can only be referred once
  await assert.rejects(() => referrals.checkReferral(db, code, 'KIM@x.com'), /own referral code/);
  const ref = await referrals.checkReferral(db, code, 'new@x.com');
  assert.equal(ref.userId, 'u1');

  // Five completed referrals earn ONE free Full Factory Reset gift, on the sized vehicle, no more
  const results = [];
  for (let i = 1; i <= 5; i++) {
    const booking = { id: `b${i}`, status: 'confirmed', name: `Friend ${i}`, referral_id: null };
    (T.booking_requests ||= []).push(booking);
    const rid = await referrals.recordReferral(db, { referrer: ref, name: `Friend ${i}`, email: `f${i}@x.com`, bookingId: booking.id });
    booking.referral_id = rid;
    results.push(await referrals.completeBooking(db, booking.id));
  }
  assert.deepEqual(results.map(r => r.rewardGift), [false, false, false, false, true]);
  assert.equal((T.garage_offers || []).length, 1);
  const gift = T.garage_offers[0];
  assert.equal(gift.vehicle_id, 'v2', 'the gift goes to the vehicle with a size');
  assert.equal(gift.discount_percent, 100); assert.equal(gift.gift_from, 'VVM Details'); assert.equal(gift.cycle_id, null);
  // Completing the same booking again changes nothing (no double count, no second gift)
  const again = await referrals.completeBooking(db, 'b5');
  assert.equal(again.rewardGift, false); assert.equal(T.garage_offers.length, 1);
  // Rewards tab numbers
  let rw = await referrals.rewardsFor(db, 'u1', 'Kim Lee');
  assert.deepEqual([rw.completed, rw.progress, rw.earned, rw.goal], [5, 0, 1, 5]);
  assert.match(rw.link, /\?coupon=KIM/);
  // A person who already used a referral cannot be referred again
  await assert.rejects(() => referrals.checkReferral(db, code, 'F1@x.com'), /new clients only/);
  // A dismissed (cancelled) referral frees the person to be referred again
  T.referrals.find(r => r.referee_email === 'f2@x.com').status = 'dismissed';
  assert.ok(await referrals.checkReferral(db, code, 'f2@x.com'));

  // No vehicle yet: the reward cannot be sent, and the admin is told instead of nothing happening
  const T2 = { garage_profiles: [{ user_id: 'u2', display_name: 'Sam', email: 's@x.com', referral_code: 'SAMAAAA' }], garage_vehicles: [], booking_requests: [], referrals: [] };
  const db2 = fakeDb(T2);
  for (let i = 1; i <= 5; i++) {
    T2.booking_requests.push({ id: `c${i}`, status: 'confirmed', referral_id: `ref${i}` });
    T2.referrals.push({ id: `ref${i}`, referrer_user_id: 'u2', status: 'pending', referee_email: `p${i}@x.com` });
  }
  let last; for (let i = 1; i <= 5; i++) last = await referrals.completeBooking(db2, `c${i}`);
  assert.equal(last.rewardGift, false); assert.match(last.warning, /no vehicle/);

  // Day-before reminders: only CONFIRMED bookings tomorrow, once each, and a clear skip when email is not set up
  const tomorrow = customerMail.tomorrowEastern();
  const sent = [];
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => { sent.push(JSON.parse(opts.body)); return { ok: true, status: 201 }; };
  const T3 = { booking_requests: [
    { id: 'x1', status: 'confirmed', booking_date: tomorrow, booking_time: '09:30', email: 'a@x.com', name: 'Ann Lee', vehicles: '2020 Audi A4', services: 'Interior Reset', drop_off: false, reminder_sent_at: null },
    { id: 'x2', status: 'requested', booking_date: tomorrow, booking_time: '10:00', email: 'b@x.com', name: 'Bo', reminder_sent_at: null },
    { id: 'x3', status: 'confirmed', booking_date: '2099-01-01', booking_time: '10:00', email: 'c@x.com', name: 'Cy', reminder_sent_at: null },
  ] };
  const db3 = fakeDb(T3);
  delete process.env.BREVO_API_KEY;
  let r = await customerMail.sendBookingReminders(db3);
  assert.equal(r.sent, 0); assert.match(r.skipped[0], /BREVO_API_KEY/); assert.equal(T3.booking_requests[0].reminder_sent_at, null, 'nothing marked sent when email is off');
  process.env.BREVO_API_KEY = 'test';
  r = await customerMail.sendBookingReminders(db3);
  assert.equal(r.sent, 1); assert.equal(sent.length, 1);
  assert.equal(sent[0].to[0].email, 'a@x.com'); assert.match(sent[0].textContent, /9:30 AM/); assert.match(sent[0].subject, /tomorrow/i);
  assert.ok(T3.booking_requests[0].reminder_sent_at);
  r = await customerMail.sendBookingReminders(db3);
  assert.equal(r.sent, 0, 'one reminder only');
  global.fetch = realFetch; delete process.env.BREVO_API_KEY;
  console.log('Referral, reward and reminder rules passed.');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
