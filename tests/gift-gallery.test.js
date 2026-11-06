const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://abc.supabase.co'; process.env.SUPABASE_ANON_KEY = 'anon'; process.env.SUPABASE_SECRET_KEY = 'secret';
const gallery = require('../server/site-gallery');
const gifts = require('../server/gift-cards');

// Tiny database stand-in: insert/select/update/eq/gte/limit/maybeSingle/single.
function fakeDb(T) {
  return { from(name) {
    const rows = T[name] || (T[name] = []); let filters = [], op = 'select', payload = null;
    const q = { select() { return q; }, eq(k, v) { filters.push(r => r[k] === v); return q; }, gte(k, v) { filters.push(r => r[k] >= v); return q; }, limit() { return q; },
      insert(v) { op = 'insert'; payload = v; return q; }, update(v) { op = 'update'; payload = v; return q; },
      maybeSingle() { return run(true); }, single() { return run(true); }, then(a, b) { return run(false).then(a, b); } };
    async function run(single) {
      if (op === 'insert') { const row = { id: '11111111-2222-3333-4444-' + String(rows.length + 1).padStart(12, '0'), created_at: new Date().toISOString(), ...payload }; rows.push(row); return { data: row, error: null }; }
      const m = rows.filter(r => filters.every(f => f(r)));
      if (op === 'update') m.forEach(r => Object.assign(r, payload));
      return { data: single ? m[0] || null : m, error: null };
    }
    return q;
  } };
}

(async () => {
  // ---- homepage photos: only our own hosts, sizes kept, tidy text
  const ok = gallery.validItems([{ src: 'https://res.cloudinary.com/kwsr06pq/image/upload/f_auto,q_auto/vvm/x', alt: ' Nice car ', width: 1300, height: 997 }, { src: 'https://abc.supabase.co/storage/v1/object/public/site-photos/gallery/a.webp', alt: '', width: 975, height: 1300 }]);
  assert.equal(ok.length, 2); assert.equal(ok[0].alt, 'Nice car'); assert.equal(ok[1].alt, 'A car detailed by VVM Details');
  assert.throws(() => gallery.validItems([{ src: 'https://evil.example/x.jpg', width: 10, height: 10 }]), /not valid/);
  assert.throws(() => gallery.validItems([{ src: 'https://abc.supabase.co/storage/v1/object/public/garage-photos/x.webp', width: 10, height: 10 }]), /not valid/, 'private client photos never go public');
  assert.throws(() => gallery.validItems([]), /at least one/);
  assert.equal(gallery.SEED.length, 20);
  assert.ok(gallery.validItems(gallery.SEED).length === 20, 'the current homepage photos are all valid');

  // ---- gift cards
  const T = {}; const db = fakeDb(T); const calls = [];
  let order = { total_money: { amount: 10000 }, state: 'OPEN', tenders: [], net_amount_due_money: { amount: 10000 } };
  const sq = async (path, o) => { calls.push([path, o && o.body]); if (path.includes('payment-links')) return { payment_link: { id: 'pl1', url: 'https://square.link/u/abc', order_id: 'ord1' } }; return { order }; };
  await assert.rejects(() => gifts.create({ amount: 999, buyerName: 'Ann', buyerEmail: 'a@x.com' }, { db, sq, location: async () => 'L1' }), /amount/);
  await assert.rejects(() => gifts.create({ amount: 10000, buyerName: 'Ann', buyerEmail: 'nope' }, { db, sq, location: async () => 'L1' }), /email/);
  const r = await gifts.create({ amount: 10000, buyerName: 'Ann Lee', buyerEmail: 'Ann@X.com', toName: 'Bo', toEmail: 'bo@x.com', message: 'Happy birthday' }, { db, sq, location: async () => 'L1' });
  assert.equal(r.url, 'https://square.link/u/abc');
  const body = calls[0][1]; assert.equal(body.quick_pay.price_money.amount, 10000); assert.equal(body.quick_pay.location_id, 'L1');
  const g = T.gift_cards[0]; assert.equal(g.square_order_id, 'ord1'); assert.equal(g.buyer_email, 'ann@x.com');
  assert.match(body.checkout_options.redirect_url, new RegExp(`/gift-cards\\?gift=${g.id}\\.${g.token}$`));

  // wrong token: refused; unpaid: no code
  await assert.rejects(() => gifts.status(`${g.id}.wrong`, { db, sq }), /not found/);
  let s = await gifts.status(`${g.id}.${g.token}`, { db, sq }); assert.equal(s.paid, false); assert.equal((T.discount_codes || []).length, 0);
  // paid for a different amount: still no code
  order = { total_money: { amount: 500 }, state: 'COMPLETED' };
  s = await gifts.status(`${g.id}.${g.token}`, { db, sq }); assert.equal(s.paid, false);
  // paid in full: one code, one-time use, same code every time after
  order = { total_money: { amount: 10000 }, state: 'OPEN', tenders: [{ id: 't' }], net_amount_due_money: { amount: 0 } };
  s = await gifts.status(`${g.id}.${g.token}`, { db, sq }); assert.equal(s.paid, true); assert.match(s.code, /^GIFT[A-HJ-NP-Z2-9]{6}$/);
  assert.deepEqual([T.discount_codes.length, T.discount_codes[0].amount_cents, T.discount_codes[0].uses_limit], [1, 10000, 1]);
  const again = await gifts.status(`${g.id}.${g.token}`, { db, sq }); assert.equal(again.code, s.code); assert.equal(T.discount_codes.length, 1);
  assert.equal((await gifts.checkPending(db, sq)).checked, 0, 'paid cards are not checked again');
  console.log('gift card and homepage photo tests passed');
})().catch(e => { console.error(e); process.exit(1); });
