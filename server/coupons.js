// Booking coupons. A code books one fixed service at a fixed price. Codes are checked on the server only,
// so the list never reaches the browser. Codes are not case sensitive and spaces are ignored.
const COUPONS = {
  KIMBEACH155: { item: 'Full Factory Reset', label: 'SUV', priceCents: 15500 },
};

function findCoupon(code) {
  const key = String(code || '').replace(/\s+/g, '').toUpperCase();
  const c = Object.prototype.hasOwnProperty.call(COUPONS, key) ? COUPONS[key] : null;
  return c ? { code: key, ...c } : null;
}

module.exports = { findCoupon };
