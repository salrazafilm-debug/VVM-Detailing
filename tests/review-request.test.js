const assert = require('node:assert/strict');
const mail = require('../server/customer-mail');

// Minimal stand-in for the database: select/eq/is/limit/update on one table.
function fakeDb(rows) {
  return { from() {
    let filters = [], op = 'select', payload = null;
    const q = { select() { return q; }, eq(k, v) { filters.push(r => r[k] === v); return q; }, is(k, v) { filters.push(r => (v === null ? r[k] == null : r[k] === v)); return q; }, limit() { return q; },
      update(v) { op = 'update'; payload = v; return q; }, then(a, b) { return run().then(a, b); } };
    async function run() { const m = rows.filter(r => filters.every(f => f(r))); if (op === 'update') m.forEach(r => Object.assign(r, payload)); return { data: m, error: null }; }
    return q;
  } };
}

(async () => {
  const yesterday = (() => { const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); const [y, m, d] = f.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10); })();
  const rows = [
    { id: 'a', status: 'completed', booking_date: yesterday, name: 'Lori Smith', email: 'lori@x.com', vehicles: '2017 Honda CRV', review_sent_at: null },
    { id: 'b', status: 'completed', booking_date: yesterday, name: 'Done Already', email: 'd@x.com', review_sent_at: '2026-11-01T00:00:00Z' },
    { id: 'c', status: 'confirmed', booking_date: yesterday, name: 'Not Completed', email: 'c@x.com', review_sent_at: null },
    { id: 'd', status: 'completed', booking_date: '2020-01-01', name: 'Old', email: 'o@x.com', review_sent_at: null },
  ];
  // No email key: nothing is sent and nothing is marked
  delete process.env.BREVO_API_KEY;
  let r = await mail.sendReviewRequests(fakeDb(rows));
  assert.equal(r.sent, 0); assert.equal(rows[0].review_sent_at, null);

  // With a key: only yesterday's completed, not-yet-asked booking gets the email, once
  process.env.BREVO_API_KEY = 'test'; const sent = [];
  global.fetch = async (_u, o) => { sent.push(JSON.parse(o.body)); return { ok: true, status: 201 }; };
  r = await mail.sendReviewRequests(fakeDb(rows));
  assert.equal(r.sent, 1); assert.equal(sent.length, 1);
  assert.equal(sent[0].to[0].email, 'lori@x.com'); assert.match(sent[0].subject, /review/i);
  assert.match(sent[0].htmlContent, /LEAVE A GOOGLE REVIEW/); assert.match(sent[0].htmlContent, /g\.page\/r\/CUdllaKYonfeEBM\/review/); assert.match(sent[0].textContent, /g\.page\/r\/CUdllaKYonfeEBM\/review/);
  assert.ok(rows[0].review_sent_at, 'marked as asked'); assert.equal(rows[2].review_sent_at, null); assert.equal(rows[3].review_sent_at, null);
  await mail.sendReviewRequests(fakeDb(rows));
  assert.equal(sent.length, 1, 'never asked twice');
  console.log('review request tests passed');
})().catch(e => { console.error(e); process.exit(1); });
