const { loadCatalog, json, fail, httpError, isPublic } = require('../square');
const { findCoupon } = require('../coupons');

// GET /api/coupon?code=KIMBEACH155 -> what the code books and what it costs
exports.handler = async (event) => {
  try {
    const coupon = findCoupon((event.queryStringParameters || {}).code);
    if (!coupon) throw httpError(404, 'That code is not valid.');
    const catalog = await loadCatalog();
    const v = Object.values(catalog).find(x => x.item === coupon.item && x.label === coupon.label && isPublic(x));
    if (!v) throw httpError(503, 'Online booking is not set up for this code yet.');
    return json(200, { code: coupon.code, item: coupon.item, label: coupon.label, id: v.id, minutes: v.durationMin, normalCents: v.priceCents, priceCents: coupon.priceCents, customer: coupon.customer || '', vehicle: coupon.vehicle || '' });
  } catch (e) { return fail(e); }
};
