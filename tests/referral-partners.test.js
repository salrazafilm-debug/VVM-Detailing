const assert = require('node:assert/strict');
const partners = require('../server/referral-partners');
const referrals = require('../server/referrals');

function fakeDb(T) {
  return { from(name) {
    const rows = T[name] || (T[name] = []); let filters = [], op = 'select', payload = null, head = false;
    const q = { select(_c, o) { head = !!(o && o.head); return q; }, eq(k, v) { filters.push(r => r[k] === v); return q; }, neq(k, v) { filters.push(r => r[k] !== v); return q; },
      ilike(k, v) { filters.push(r => String(r[k]).toLowerCase() === String(v).toLowerCase()); return q; }, in() { return q; }, limit() { return q; }, order() { return q; },
      insert(v) { op = 'insert'; payload = v; return q; }, update(v) { op = 'update'; payload = v; return q; },
      maybeSingle() { return run(true); }, single() { return run(true); }, then(a, b) { return run(false).then(a, b); } };
    async function run(single) {
      if (op === 'insert') { const row = { id: `${name}-${rows.length + 1}`, redeemed: 0, status: 'pending', ...payload }; rows.push(row); return { data: row, error: null }; }
      const m = rows.filter(r => filters.every(f => f(r)));
      if (op === 'update') m.forEach(r => Object.assign(r, payload));
      if (head) return { count: m.length, data: null, error: null };
      return { data: single ? m[0] || null : m, error: null };
    }
    return q;
  } };
}

(async () => {
  const T = { garage_profiles: [], discount_codes: [], coupons: [], garage_offers: [], referral_partners: [], partner_referrals: [] };
  const db = fakeDb(T);
  const p = await partners.create(db, { name: 'Maria Lopez', code: 'maria 27' });
  assert.equal(p.code, 'MARIA27');
  await assert.rejects(() => partners.create(db, { name: 'Other', code: 'MARIA27' }), /already in use/);
  await assert.rejects(() => partners.create(db, { name: 'Xy', code: 'AB' }), /4 to 12/);
  // a partner's code works in the booking code box; the email may only use it once
  const ref = await referrals.checkReferral(db, 'MARIA27', 'new1@x.com');
  assert.equal(ref.partnerId, p.id);
  await referrals.recordReferral(db, { referrer: ref, name: 'New One', email: 'new1@x.com', bookingId: 'b1' });
  await assert.rejects(() => referrals.checkReferral(db, 'MARIA27', 'new1@x.com'), /new clients only/);
  // 4 more friends, each booking marked completed
  for (let i = 2; i <= 5; i++) {
    T.booking_requests = T.booking_requests || [];
    T.booking_requests.push({ id: `b${i}`, status: 'confirmed', referral_id: null });
    const r = await referrals.checkReferral(db, 'MARIA27', `new${i}@x.com`);
    await referrals.recordReferral(db, { referrer: r, name: `F${i}`, email: `new${i}@x.com`, bookingId: `b${i}` });
  }
  T.booking_requests.push({ id: 'b1', status: 'confirmed', referral_id: null });
  let res = await referrals.completeBooking(db, 'b1');
  assert.equal(res.partner.progress, 1); assert.equal(res.partner.earned, 0);
  // completing twice does not count twice
  res = await referrals.completeBooking(db, 'b1');
  assert.equal(res.partner, null);
  for (let i = 2; i <= 4; i++) await referrals.completeBooking(db, `b${i}`);
  res = await referrals.completeBooking(db, 'b5');
  assert.equal(res.partner.completed, 5); assert.equal(res.partner.progress, 0); assert.equal(res.partner.earned, 1);
  // owner uses the free detail
  await partners.redeem(db, p.id);
  const [row] = await partners.list(db);
  assert.equal(row.earned, 0); assert.equal(row.progress, 0);
  await assert.rejects(() => partners.redeem(db, p.id), /No free detail/);
  console.log('referral partner tests passed');
})().catch(e => { console.error(e); process.exit(1); });
