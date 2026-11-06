// Gift cards, paid by card through a Square payment link (Square's own secure checkout page; card details never
// touch this site). After payment the buyer comes back to /gift-cards, the order is checked with Square, and a
// one-time code worth the card is made (a normal discount code, so it works in the booking code box) and emailed.
// The daily cron also checks unpaid cards, in case the buyer closed the page before coming back.
const crypto = require('node:crypto');
const { sq, getLocationId, httpError } = require('./square');
const { client } = require('./coupon-db');
const { sendCustomerEmail } = require('./customer-mail');
const { sendBookingEmail } = require('./mail');

const MIN_CENTS = 2500, MAX_CENTS = 100000;      // custom amounts: $25 to $1,000, whole dollars
// A Full Factory Reset gift, priced from the website's own price list (catalog-static.js) by vehicle size.
const SIZES = [['coupe', 'Coupe', /^coupe/i], ['sedan', 'Sedan', /^sedan/i], ['suv', 'SUV', /^suv/i], ['truck', 'Truck', /^truck/i], ['minivan', 'Minivan', /^mini-?\s?van/i]];
function resetOptions() {
  const rows = Object.values(require('./catalog-static').STATIC_CATALOG).filter(v => v.item === 'Full Factory Reset');
  return SIZES.map(([size, label, re]) => { const v = rows.find(r => re.test(r.label)); return v ? { size, label, cents: v.priceCents } : null; }).filter(Boolean);
}
const options = () => ({ minCents: MIN_CENTS, maxCents: MAX_CENTS, reset: resetOptions() });
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.vvmdetails.com').replace(/\/$/, '');
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const clean = (s, max) => String(s || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const dollars = c => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => 'GIFT' + Array.from(crypto.randomBytes(6), b => CODE_CHARS[b % CODE_CHARS.length]).join('');

// Paid = Square took the money for the full amount.
function orderPaid(order, amountCents) {
  if (!order) return false;
  const total = order.total_money?.amount;
  if (total !== amountCents) return false;
  if (order.state === 'COMPLETED') return true;
  return (order.tenders || []).length > 0 && (order.net_amount_due_money?.amount ?? 1) === 0;
}

async function create(b, deps = {}) {
  const db = deps.db || client(), square = deps.sq || sq, location = deps.location || getLocationId;
  let amount, label = null;
  if (b.reset) {
    const opt = resetOptions().find(o => o.size === b.reset);
    if (!opt) throw httpError(400, 'Pick a vehicle size.');
    amount = opt.cents; label = `Full Factory Reset (${opt.label})`;
  } else {
    amount = Math.round(Number(b.amount) / 100) * 100;
    if (!(amount >= MIN_CENTS && amount <= MAX_CENTS)) throw httpError(400, 'Pick an amount from $25 to $1,000.');
  }
  const buyer_name = clean(b.buyerName, 80), buyer_email = clean(b.buyerEmail, 120).toLowerCase();
  const to_name = clean(b.toName, 80), to_email = clean(b.toEmail, 120).toLowerCase(), message = clean(b.message, 300);
  if (buyer_name.length < 2) throw httpError(400, 'Please enter your name.');
  if (!EMAIL.test(buyer_email)) throw httpError(400, 'Please enter your email.');
  if (to_email && !EMAIL.test(to_email)) throw httpError(400, 'Please check their email.');
  const token = crypto.randomBytes(18).toString('base64url');
  const { data: row, error } = await db.from('gift_cards').insert({ token, amount_cents: amount, label, buyer_name, buyer_email, to_name: to_name || null, to_email: to_email || null, message: message || null, status: 'pending' }).select('id').single();
  if (error || !row) throw httpError(503, 'Gift cards are not set up yet. Please text us to buy one.');
  const link = await square('/v2/online-checkout/payment-links', { method: 'POST', body: {
    idempotency_key: row.id,
    quick_pay: { name: `VVM Details gift card: ${label || dollars(amount)}`, price_money: { amount, currency: 'USD' }, location_id: await location() },
    checkout_options: { redirect_url: `${SITE}/gift-cards?gift=${row.id}.${token}`, ask_for_shipping_address: false },
    pre_populated_data: { buyer_email },
  } });
  const pl = link.payment_link || {};
  if (!pl.url || !pl.order_id) throw httpError(502, 'Card checkout is not available right now. Please text us to buy one.');
  await db.from('gift_cards').update({ square_order_id: pl.order_id, square_link_id: pl.id || null }).eq('id', row.id);
  return { url: pl.url };
}

function giftHtml(g, code) {
  const to = g.to_name || g.buyer_name;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#e9b3b3;font-family:Manrope,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#e9b3b3;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden">
  <tr><td align="center" style="background:#1a1214;padding:28px 24px">
    <img src="${SITE}/assets/logo.jpg" width="96" alt="VVM Details" style="display:block;margin:0 auto 14px;border-radius:12px;width:96px;height:auto;border:0">
    <div style="font-family:'Montserrat',Helvetica,Arial,sans-serif;font-style:italic;font-weight:900;font-size:26px;color:#ffffff">A GIFT FOR YOU</div>
    <div style="height:4px;width:120px;margin:14px auto 0;background:linear-gradient(90deg,#4f8ff0,#f0d63c,#e4572e);border-radius:4px"></div>
  </td></tr>
  <tr><td style="padding:28px 28px 8px">
    <p style="margin:0 0 6px;font-size:17px;color:#1a1214;font-weight:700">Hi ${esc(String(to).split(/\s+/)[0])},</p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#1a1214">${g.to_name ? `${esc(g.buyer_name)} sent you a VVM Details gift card.` : 'Here is your VVM Details gift card.'}</p>
    ${g.message ? `<p style="margin:0 0 14px;padding:12px 14px;border-radius:12px;background:#fff7d6;font-size:15px;line-height:1.5;color:#1a1214">&ldquo;${esc(g.message)}&rdquo;</p>` : ''}
  </td></tr>
  <tr><td align="center" style="padding:8px 28px 18px">
    <div style="display:inline-block;padding:22px 34px;border-radius:20px;background:linear-gradient(110deg,#ffe27a,#f7c948,#f0b429);color:#1a1214">
      <div style="font-family:'Montserrat',Helvetica,Arial,sans-serif;font-style:italic;font-weight:900;font-size:44px;line-height:1">${dollars(g.amount_cents)}</div>
      ${g.label ? `<div style="margin-top:6px;font-size:14px;font-weight:800">${esc(g.label)}</div>` : ''}
      <div style="margin-top:10px;font-size:12px;font-weight:800;letter-spacing:.2em">YOUR CODE</div>
      <div style="margin-top:4px;font-family:monospace;font-size:24px;font-weight:800;letter-spacing:.12em">${esc(code)}</div>
    </div>
    <p style="margin:16px 0 0;font-size:14px;color:#7a6468;line-height:1.5">Book at vvmdetails.com and type the code in the coupon box. One-time use.</p>
    <a href="${SITE}/#book" style="display:inline-block;margin-top:16px;background:#1a1214;color:#ffffff;text-decoration:none;font-weight:800;font-size:14px;letter-spacing:.06em;padding:14px 26px;border-radius:999px">BOOK MY DAY</a>
  </td></tr>
  <tr><td align="center" style="padding:18px 28px 26px;border-top:1px solid #f1e4e4">
    <p style="margin:0;font-size:12px;color:#7a6468">VVM Details &middot; Mobile car detailing &middot; Chesapeake Beach, MD &middot; (240) 601-9451</p>
  </td></tr>
</table></td></tr></table></body></html>`;
}

// Makes the code once (the status update only succeeds for the first caller), then sends the emails.
async function finalize(db, g) {
  const code = newCode();
  const { data: won } = await db.from('gift_cards').update({ status: 'paid', code, paid_at: new Date().toISOString() }).eq('id', g.id).eq('status', 'pending').select('id');
  if (!won || !won.length) { const { data } = await db.from('gift_cards').select('code').eq('id', g.id).maybeSingle(); return data?.code || null; }
  const { error } = await db.from('discount_codes').insert({ code, amount_cents: g.amount_cents, uses_limit: 1, active: true });
  if (error) console.error('gift code save failed:', error.message);
  const to = g.to_email || g.buyer_email;
  const text = [`${g.to_name ? `${g.buyer_name} sent you` : 'Here is'} a VVM Details gift card: ${dollars(g.amount_cents)}${g.label ? ` (${g.label})` : ''}.`, g.message ? `"${g.message}"` : '', `Your code: ${code}`, 'Book at vvmdetails.com and type the code in the coupon box. One-time use.', '', 'VVM Details'].filter(Boolean).join('\n');
  await sendCustomerEmail({ to, name: g.to_name || g.buyer_name, subject: `Your ${dollars(g.amount_cents)} VVM Details gift card`, text, html: giftHtml(g, code) }).catch(() => {});
  if (g.to_email && g.to_email !== g.buyer_email) await sendCustomerEmail({ to: g.buyer_email, name: g.buyer_name, subject: `Your gift card was sent to ${g.to_name || g.to_email}`, text: `Thank you! Your ${dollars(g.amount_cents)} gift card was emailed to ${g.to_name || ''} (${g.to_email}).\nCode: ${code}\n\nVVM Details`, html: giftHtml(g, code) }).catch(() => {});
  await sendBookingEmail({ subject: `Gift card sold: ${dollars(g.amount_cents)} from ${g.buyer_name}`, replyTo: g.buyer_email, lines: [`Amount: ${dollars(g.amount_cents)}${g.label ? ` - ${g.label}` : ''} (paid by card through Square)`, `From: ${g.buyer_name} (${g.buyer_email})`, `To: ${g.to_name || 'themself'}${g.to_email ? ` (${g.to_email})` : ''}`, `Code: ${code} (one-time use, also in Admin > Rewards)`, g.message ? `Message: ${g.message}` : 'Message: none'] }).catch(() => {});
  return code;
}

async function check(db, g, square = sq) {
  if (g.status === 'paid') return { paid: true, code: g.code, amount_cents: g.amount_cents, label: g.label || null };
  if (!g.square_order_id) return { paid: false };
  const { order } = await square(`/v2/orders/${encodeURIComponent(g.square_order_id)}`);
  if (!orderPaid(order, g.amount_cents)) return { paid: false };
  return { paid: true, code: await finalize(db, g), amount_cents: g.amount_cents, label: g.label || null };
}

// Buyer's return page: "gift" is "<id>.<token>" from the redirect link.
async function status(gift, deps = {}) {
  const db = deps.db || client();
  const [id, token] = String(gift || '').split('.');
  if (!/^[0-9a-f-]{36}$/i.test(id || '') || !token) throw httpError(400, 'Gift card not found.');
  const { data: g } = await db.from('gift_cards').select('*').eq('id', id).maybeSingle();
  if (!g || g.token !== token) throw httpError(404, 'Gift card not found.');
  const r = await check(db, g, deps.sq);
  return { ...r, to_name: g.to_name, to_email: g.to_email, buyer_email: g.buyer_email };
}

// Daily cron: unpaid cards from the last 3 days.
async function checkPending(db, square = sq) {
  const since = new Date(Date.now() - 3 * 86400000).toISOString();
  const { data, error } = await db.from('gift_cards').select('*').eq('status', 'pending').gte('created_at', since).limit(30);
  if (error) return { error: 'Could not read gift cards.' };
  let paid = 0;
  for (const g of data || []) { try { if ((await check(db, g, square)).paid) paid++; } catch { /* try again tomorrow */ } }
  return { checked: (data || []).length, paid };
}

module.exports = { options, resetOptions, MIN_CENTS, MAX_CENTS, create, status, check, checkPending, finalize, orderPaid, newCode, giftHtml };
