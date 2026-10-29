const { json, httpError } = require('../square');
const { sendBookingEmail } = require('../mail');
const { takeDiscountUse, giveBackDiscountUse, findDiscount, client } = require('../coupon-db');
const travel = require('../travel');
const referrals = require('../referrals');

const clean = (s, max) => String(s || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const dollars = c => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;

// Book My Day: emails the owner exactly what the client typed and the day and time they chose, then keeps a record
// of the request (admin, reminders, referrals). No Square reads, no time check, no holds.
async function emailRequest(b) {
  const name = clean(b.name, 80), email = clean(b.email, 120), notes = clean(b.notes, 1000);
  const digits = String(b.phone || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  if (name.length < 2) throw httpError(400, 'Please enter your name.');
  if (digits && digits.length !== 10) throw httpError(400, 'Please enter a 10-digit phone number.');
  const location = clean(b.location, 200);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw httpError(400, 'Please enter a valid email.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '') || !/^\d{2}:\d{2}$/.test(b.time || '')) throw httpError(400, 'Please choose a day and time.');
  const vehicles = (Array.isArray(b.vehicles) ? b.vehicles : []).map(v => clean(v, 120)).filter(Boolean);
  const two = vehicles.length > 1;
  const services = clean(b.summary, 1500) || 'Not listed';
  // A gifted detail (free): the email says so at the top, so it is not mistaken for a paid booking.
  const gift = b.gift === true;
  const coupon = clean(b.coupon, 40);

  // Where we go: a ZIP code sets the travel fee and the family area. Drop-off has no travel fee.
  const dropOff = b.dropOff === true;
  const zipInfo = dropOff && !b.zip ? null : travel.lookupZip(b.zip);
  if (!dropOff && !zipInfo.ok) throw httpError(400, zipInfo.message);
  if (!dropOff) {
    // Mobile service needs the address. If it ends in a ZIP, that ZIP must be the one that set the fee.
    if (location.length < 5) throw httpError(400, 'Please enter the address where we should arrive.');
    const tail = location.match(/\b(\d{5})(?:-\d{4})?\s*$/);
    if (tail && tail[1] !== zipInfo.zip) throw httpError(400, `The ZIP in your address (${tail[1]}) is not the ZIP that was checked (${zipInfo.zip}). Please check both.`);
  }
  const feeCents = dropOff || !zipInfo?.ok ? 0 : zipInfo.feeCents;
  const family = !!(zipInfo && zipInfo.ok && zipInfo.family);

  // One discount per booking, the biggest wins. None when a membership or gift price is already used.
  const discountCode = clean(b.discount, 40).replace(/\s+/g, '').toUpperCase();
  if (discountCode && coupon) throw httpError(400, 'A discount code cannot be used together with a membership or gift price.');
  // The database is only opened when a code, referral or the booking record needs it.
  let _db = null;
  const db = () => (_db = _db || client());
  let codeInfo = null;
  if (discountCode) {
    codeInfo = await findDiscount(discountCode);
    if (!codeInfo || codeInfo.usesLeft < 1) throw httpError(400, 'That code has been used up or is no longer valid. Please check it or call us.');
  }
  const referralCode = coupon ? '' : referrals.normalizeCode(clean(b.referral, 40));
  let referrer = null;
  if (referralCode) {
    referrer = await referrals.checkReferral(db(), referralCode, email);
    if (!referrer) throw httpError(400, 'That referral code is not valid.');
  }
  const best = coupon ? null : travel.bestDiscount([
    codeInfo && { kind: 'code', label: `Code ${codeInfo.code}`, cents: codeInfo.amountCents },
    family && { kind: 'family', label: 'Family area', cents: travel.FAMILY_DISCOUNT_CENTS },
    referrer && b.hasReset === true && { kind: 'referral', label: `Referral ${referrer.code}`, cents: travel.REFERRAL_DISCOUNT_CENTS },
  ]);
  const servicesCents = Math.max(0, Math.min(1000000, Math.round(Number(b.servicesCents) || 0)));
  const price = travel.priceBooking({ servicesCents, feeCents, discount: best });
  // Only the code that actually wins uses up one of its uses.
  const use = best && best.kind === 'code' ? await takeDiscountUse(codeInfo.code) : null;

  try {
    await sendBookingEmail({
      subject: `${gift ? 'GIFTED DETAIL (FREE) - ' : ''}New booking request: ${b.date} ${b.time} - ${name}`,
      replyTo: email,
      lines: [
        ...(gift ? [`GIFTED DETAIL (FREE): from ${clean(b.gift_from, 40) || 'VVM Details'}. Charge: $0.`] : []),
        `Name: ${name}`, `Phone: ${digits ? b.phone : 'Not on file'}`, `Email: ${email}`, `Location: ${location || 'Not given'}`,
        `Day: ${b.date}`, `Time: ${b.time}`,
        `Vehicle${two ? 's' : ''}: ${two ? vehicles.map((v, i) => `${i + 1}) ${v}`).join(' | ') : vehicles[0] || 'Not given'}`,
        `Services: ${services}`,
        dropOff
          ? `DROP-OFF: the customer brings the vehicle to you. No travel fee.${zipInfo?.ok ? ` Their ZIP: ${zipInfo.zip}.` : ''}`
          : `Travel: ZIP ${zipInfo.zip} (${zipInfo.city}, ${zipInfo.state}), about ${zipInfo.minutes} min. Travel fee: ${dollars(feeCents)}.`,
        ...(family ? ['Family area: yes'] : []),
        ...(coupon ? [`Code / membership: ${coupon}`] : []),
        ...(best ? [`Discount applied: ${best.label} (-${dollars(best.cents)}). One discount per booking.`] : []),
        ...(codeInfo && best && best.kind !== 'code' ? [`Note: the customer also entered code ${codeInfo.code}, but a bigger discount was used, so the code was NOT used up.`] : []),
        ...(referrer ? [`REFERRAL: used ${referrer.code} (from ${referrals.firstName(referrer.name)}). It counts for them when you mark this booking completed in admin.${best && best.kind === 'referral' ? ' New client $20 off the Full Factory Reset.' : ''}`] : []),
        ...(!coupon ? [`Quote shown to customer: services ${dollars(price.servicesCents)} + travel ${dollars(price.feeCents)} - discount ${dollars(price.discountCents)} = TOTAL ${dollars(price.totalCents)}`] : []),
        `Email offers: ${b.optIn === true ? 'yes, they said yes' : 'no'}`,
        `Notes: ${notes || 'None'}`,
      ],
    });
  } catch (e) {
    if (use) await giveBackDiscountUse(use.id).catch(() => {});
    console.error('booking email failed:', e.message);
    throw httpError(e.status || 502, e.status === 503 ? e.message : 'We could not send your request. Please call or text us to book.');
  }

  // The email went out. Now keep a record for admin, reminders and referrals. A problem here is logged, never shown.
  try {
    const { data: row, error } = await db().from('booking_requests').insert({
      name, email, phone: digits ? b.phone : null, zip: zipInfo?.zip || null, drop_off: dropOff, travel_fee_cents: feeCents,
      discount_label: best ? best.label : null, discount_cents: price.discountCents, total_cents: coupon ? null : price.totalCents,
      vehicles: vehicles.join(' | '), services, booking_date: b.date, booking_time: b.time, coupon: coupon || null, gift, marketing_opt_in: b.optIn === true,
    }).select('id').single();
    if (error) throw new Error(error.message);
    if (referrer) {
      const referralId = await referrals.recordReferral(db(), { referrer, name, email, bookingId: row.id });
      await db().from('booking_requests').update({ referral_id: referralId }).eq('id', row.id);
    }
  } catch (e) { console.error('booking record failed:', e.message); }
  return json(200, { ok: true, when: `${b.date} ${b.time}`, service: services, mode: 'request' });
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') throw httpError(405, 'Use POST.');
    const b = JSON.parse(event.body || '{}');
    if (b.website) return json(200, { ok: true }); // honeypot: bots fill this in
    return await emailRequest(b);
  } catch (e) {
    return json(e.status && e.status < 500 ? e.status : 502, { error: e.status && e.status < 500 ? e.message : 'We could not send your request. Please call or text us to book.' });
  }
};
