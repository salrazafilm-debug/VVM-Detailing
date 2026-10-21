const { loadCatalog, json, fail, httpError, isPublic } = require('../square');
const { findCoupon, store: couponStore, sizeMatches } = require('../coupon-db');

// GET /api/coupon?code=KIMBEACH160 -> what the code books and what it costs
exports.handler = async (event) => {
  try {
    const code = (event.queryStringParameters || {}).code;
    let coupon = await findCoupon(code);
    if (!coupon) {
      const offer = await couponStore().garageOffer(code);
      if (!offer) throw httpError(404, 'That offer is no longer available.');
      const catalog = await loadCatalog();
      if (!offer.size) throw httpError(400, 'Your Full Factory Reset size is not set yet. Please call or text VVM to book.');
      const v = Object.values(catalog).find(x => x.item === 'Full Factory Reset' && isPublic(x) && sizeMatches(x.label, offer.size));
      if (!v) throw httpError(503, 'Your Full Factory Reset price is not set up yet. Please call or text VVM.');
      const selected = { id:v.id,label:v.label,normalCents:v.priceCents,priceCents:Math.ceil(v.priceCents/2),savingCents:Math.floor(v.priceCents/2) };
      return json(200, { code:offer.coupon_code, item:'Full Factory Reset', label:selected.label, id:selected.id, priceCents:selected.priceCents, normalCents:selected.normalCents, savingCents:selected.savingCents, garage_offer:true, membership:true, vehicle:[offer.vehicle.year, offer.vehicle.make, offer.vehicle.model].filter(Boolean).join(' ') });
    }
    if (await couponStore().count(coupon.code) >= coupon.uses) throw httpError(404, 'This code has been used up.');
    const catalog = await loadCatalog();
    const v = Object.values(catalog).find(x => x.item === coupon.item && x.label === coupon.label && isPublic(x));
    if (!v) throw httpError(503, 'Online booking is not set up for this code yet.');
    return json(200, { code: coupon.code, item: coupon.item, label: coupon.label, id: v.id, minutes: v.durationMin, normalCents: v.priceCents, priceCents: coupon.priceCents, savingCents: coupon.savingCents, customer: coupon.customer || '', vehicle: coupon.vehicle || '', address: coupon.address || '', phone: coupon.phone || '', email: coupon.email || '' });
  } catch (e) { return fail(e); }
};
