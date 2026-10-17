const { loadCatalog, json, fail, httpError, isPublic } = require('../square');
const { findCoupon, store: couponStore } = require('../coupon-db');

// GET /api/coupon?code=KIMBEACH160 -> what the code books and what it costs
exports.handler = async (event) => {
  try {
    const code = (event.queryStringParameters || {}).code;
    let coupon = await findCoupon(code);
    if (!coupon) {
      const offer = await couponStore().garageOffer(code);
      if (!offer) throw httpError(404, 'That offer is no longer available.');
      const catalog = await loadCatalog();
      const sizes = Object.values(catalog).filter(v => v.item === 'Full Factory Reset' && isPublic(v) && Math.floor(v.priceCents / 2) > 14500).map(v => ({ id:v.id,label:v.label,normalCents:v.priceCents,priceCents:Math.ceil(v.priceCents/2),savingCents:Math.floor(v.priceCents/2) }));
      if (!sizes.length) throw httpError(503, 'The Full Factory Reset offer is not configured in Square yet.');
      const selected = sizes.find(v => v.label.toLowerCase() === 'suv') || sizes[0];
      return json(200, { code:offer.coupon_code, item:'Full Factory Reset', label:selected.label, id:selected.id, priceCents:selected.priceCents, normalCents:selected.normalCents, savingCents:selected.savingCents, size_options:sizes, garage_offer:true, vehicle:'Vehicle on file' });
    }
    if (await couponStore().count(coupon.code) >= coupon.uses) throw httpError(404, 'This code has been used up.');
    const catalog = await loadCatalog();
    const v = Object.values(catalog).find(x => x.item === coupon.item && x.label === coupon.label && isPublic(x));
    if (!v) throw httpError(503, 'Online booking is not set up for this code yet.');
    return json(200, { code: coupon.code, item: coupon.item, label: coupon.label, id: v.id, minutes: v.durationMin, normalCents: v.priceCents, priceCents: coupon.priceCents, savingCents: coupon.savingCents, customer: coupon.customer || '', vehicle: coupon.vehicle || '', address: coupon.address || '', phone: coupon.phone || '', email: coupon.email || '' });
  } catch (e) { return fail(e); }
};
