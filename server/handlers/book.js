const { sq, loadCatalog, getLocationId, blocksByDay, json, fail, httpError, isPublic } = require('../square');
const { slotsForJobs, localToUtc, fromHHMM, resolvePlan, partyBlocks } = require('../rules');
const { blocksWithHolds, addHold } = require('../holds');
const { sendBookingEmail } = require('../mail');
const { findCoupon, store: couponStore } = require('../coupon-db');
const { resolveAddons } = require('../addons');
const crypto = require('crypto');

const clean = (s, max) => String(s || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const money = c => '$' + (c / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });

exports.handler = async (event) => {
  let claimedGarageOfferId = null;
  try {
    if (event.httpMethod !== 'POST') throw httpError(405, 'Use POST.');
    const b = JSON.parse(event.body || '{}');
    if (b.website) return json(200, { ok: true }); // honeypot: bots fill this in

    const name = clean(b.name, 80), email = clean(b.email, 120), notes = clean(b.notes, 1000);
    const digits = String(b.phone || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
    if (name.length < 2) throw httpError(400, 'Please enter your name.');
    if (digits.length !== 10) throw httpError(400, 'Please enter a 10-digit phone number.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw httpError(400, 'Please enter a valid email.');

    // The cart: one array of service ids per vehicle (older pages send a single variationId and vehicle).
    let plan = Array.isArray(b.plan) ? b.plan : (b.variationId ? [[b.variationId]] : []);
    // A coupon books its one fixed service for its fixed price. The browser's plan is ignored for coupons.
    let coupon = b.coupon ? await findCoupon(b.coupon) : null;
    const garageOffer = b.coupon && !coupon ? await couponStore().garageOffer(b.coupon) : null;
    if (b.coupon && !coupon && !garageOffer) throw httpError(400, 'That offer is no longer available.');
    // The coupon's own car, when it has one, replaces what the browser sent.
    const vehicles = (coupon && coupon.vehicle) || garageOffer ? [coupon?.vehicle || `${garageOffer.vehicle.year} ${garageOffer.vehicle.make} ${garageOffer.vehicle.model}`] : (Array.isArray(b.vehicles) ? b.vehicles : [b.vehicle]).map(v => clean(v, 120));
    if (!coupon && (!plan.length || vehicles.length !== plan.length || vehicles.some(v => v.length < 2))) {
      throw httpError(400, plan.length > 1 ? 'Please enter the year, make and model of both vehicles.' : 'Please enter your vehicle year, make and model.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '') || !/^\d{2}:\d{2}$/.test(b.time || '')) throw httpError(400, 'Invalid date or time.');


    if (coupon && await couponStore().count(coupon.code) >= coupon.uses) throw httpError(400, 'This code has been used up.');
    const catalog = await loadCatalog();
    if (coupon) {
      const v = Object.values(catalog).find(x => x.item === coupon.item && x.label === coupon.label && isPublic(x));
      if (!v) throw httpError(503, 'Online booking is not set up for this code yet.');
      plan = [[v.id]];
    } else if (garageOffer) {
      if (String(garageOffer.email).toLowerCase() !== email.toLowerCase()) throw httpError(403, 'This offer is linked to a different customer email.');
      const v = Object.values(catalog).find(x => x.id === b.offerVariationId && x.item === 'Full Factory Reset' && isPublic(x));
      if (!v || Math.floor(v.priceCents / 2) <= 14500) throw httpError(400, 'Choose an eligible Full Factory Reset size for your offer.');
      coupon = { code:garageOffer.coupon_code, item:v.item, label:v.label, priceCents:Math.ceil(v.priceCents/2), savingCents:Math.floor(v.priceCents/2), normalCents:v.priceCents, customer:name, vehicle:vehicles[0], garageOfferId:garageOffer.id };
      plan = [[v.id]];
    }
    const { cars, jobs } = resolvePlan(plan, catalog, isPublic);

    // Re-check availability on the server so a stale page can never double-book.
    const nextDay = new Date(localToUtc(b.date, 24 * 60 + 60)); // safely into the next local day
    const toDate = nextDay.toISOString().slice(0, 10);
    const blocks = await blocksWithHolds(await blocksByDay(b.date, toDate, catalog), b.date.slice(0, 7));
    const open = slotsForJobs(b.date, blocks[b.date] || [], jobs, new Date());
    if (!open.includes(b.time)) throw httpError(409, 'Sorry, that time was just taken. Please pick another.');

    if (garageOffer && process.env.BOOKING_MODE !== 'square' || garageOffer && process.env.DRY_RUN === 'false') {
      claimedGarageOfferId = await couponStore().claimGarageOffer(garageOffer.coupon_code, email);
      if (!claimedGarageOfferId) throw httpError(409, 'This offer was just used or has expired.');
      coupon.garageOfferId = claimedGarageOfferId;
    }

    const two = cars.length > 1;
    const serviceText = cars.map((c, i) => `${two ? `Vehicle ${i + 1}: ` : ''}${c.services.map(v => `${v.item} - ${v.label}`).join(' + ')}`).join(' | ');
    const vehicleText = two ? vehicles.map((v, i) => `Vehicle ${i + 1}: ${v}`).join(' | ') : vehicles[0];
    // Add-ons (not for coupon bookings, which are a fixed price). The server prices them, never the browser.
    const addons = coupon ? cars.map(() => []) : resolveAddons(b.addons, cars);
    const addonCents = addons.flat().reduce((n, a) => n + a.priceCents, 0);
    const addonText = addons.map((list, i) => list.length ? `${two ? `Vehicle ${i + 1}: ` : ''}${list.map(a => `${a.name} (${money(a.priceCents)})`).join(', ')}` : '').filter(Boolean).join(' | ');
    const totalCents = coupon ? coupon.priceCents : jobs.reduce((n, j) => n + j.priceCents, 0) + addonCents;
    const result = { ok: true, when: `${b.date} ${b.time}`, service: serviceText };

    // Free Square plans cannot create bookings through the API, so by default the request is emailed
    // to the owner (Resend) to be confirmed in Square.
    if (process.env.BOOKING_MODE !== 'square') {
      // 1) Send the request to the owner first. If this fails the customer is told, and no time is held.
      try {
        await sendBookingEmail({
          subject: `New booking request: ${b.date} ${b.time} - ${name}`,
          replyTo: email,
          lines: [
            `Name: ${name}`, `Phone: ${b.phone}`, `Email: ${email}`,
            `Date: ${b.date}`, `Start: ${b.time}`,
            `Vehicle: ${vehicleText}`, `Services: ${serviceText}`,
            `Party: ${two ? '2 vehicles, back to back' : '1 vehicle'}`, `Total: ${money(totalCents)}`,
            ...(addonText ? [`Add-ons: ${addonText}`] : []),
            ...(coupon ? [`Coupon: ${coupon.code} (special price, not the Square price)`] : []),
            `Concerns / where to arrive: ${notes || 'None'}`,
          ],
        });
      } catch (e) {
        console.error('booking email failed:', e.message);
        if (claimedGarageOfferId) await couponStore().releaseGarageOffer(claimedGarageOfferId).catch(() => {});
      claimedGarageOfferId = null;
        throw httpError(e.status || 502, e.status === 503 ? e.message : 'We could not send your request. Please call or text us to book.');
      }
      // 2) Only after the owner has been notified, hold the time(s) so nobody else can pick them.
      //    Each vehicle is held as its own booking, back to back, so it matches how it is entered in Square.
      for (const blk of partyBlocks(fromHHMM(b.time), jobs)) await addHold({ date: b.date, ...blk });
      // 3) The booking is sent and held, so the coupon use counts now.
      if (coupon?.garageOfferId) { await couponStore().redeemGarageOffer(coupon.garageOfferId); claimedGarageOfferId = null; }
      else if (coupon) await couponStore().add(coupon.code).catch(e => console.error('coupon use not counted:', e.message));
      return json(200, { ...result, mode: 'request' });
    }
    if (process.env.DRY_RUN !== 'false') {
      if (claimedGarageOfferId) await couponStore().releaseGarageOffer(claimedGarageOfferId);
      claimedGarageOfferId = null;
      return json(200, { ...result, mode: 'square', dryRun: true });
    }

    const [given, ...rest] = name.split(/\s+/);
    const found = await sq('/v2/customers/search', { method: 'POST', body: { query: { filter: { email_address: { exact: email } } } } });
    let customerId = found.customers && found.customers[0] && found.customers[0].id;
    if (!customerId) {
      const created = await sq('/v2/customers', { method: 'POST', body: {
        idempotency_key: crypto.randomUUID(), given_name: given, family_name: rest.join(' ') || undefined,
        email_address: email, phone_number: '+1' + digits,
      } });
      customerId = created.customer.id;
    }

    // One Square booking per vehicle, back to back; every service on a vehicle is a segment of that booking.
    const location = await getLocationId();
    const bookingIds = [];
    let at = fromHHMM(b.time);
    for (const [i, car] of cars.entries()) {
      const booking = await sq('/v2/bookings', { method: 'POST', body: {
        idempotency_key: crypto.randomUUID(),
        booking: {
          location_id: location,
          start_at: localToUtc(b.date, at).toISOString(),
          customer_id: customerId,
          customer_note: `Booked on vvmdetails.com${two ? ` (vehicle ${i + 1} of 2, same day)` : ''}\nVehicle: ${vehicles[i]}\nConcerns: ${notes || 'None'}\nPhone: ${b.phone}`,
          appointment_segments: car.services.map(v => ({
            duration_minutes: v.durationMin,
            service_variation_id: v.id,
            service_variation_version: v.version,
            team_member_id: process.env.SQUARE_TEAM_MEMBER_ID || v.teamMemberId,
          })),
        },
      } });
      bookingIds.push(booking.booking.id);
      at += car.job.durationMin + (car.job.transitionMin || 0);
    }
    if (coupon?.garageOfferId) { await couponStore().redeemGarageOffer(coupon.garageOfferId); claimedGarageOfferId = null; }
    return json(200, { ...result, mode: 'square', bookingIds });
  } catch (e) {
    if (claimedGarageOfferId) await couponStore().releaseGarageOffer(claimedGarageOfferId).catch(() => {});
    return fail(e);
  }
};
