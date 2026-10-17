// Booking coupons. A code books one fixed service at a fixed price. Codes are checked on the server only,
// so the list never reaches the browser. A coupon can carry its customer's name and car, so the vehicle is filled in for them. Codes are not case sensitive and spaces are ignored.
const COUPONS = {
  KIMBEACH160: { item: 'Full Factory Reset', label: 'SUV', priceCents: 16000, savingCents: 16000, uses: 3, customer: 'Kim', vehicle: '2021 Chevy Equinox' },
};

function findCoupon(code) {
  const key = String(code || '').replace(/\s+/g, '').toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(COUPONS, key)) return null;
  // Contact details are private settings in Vercel, named after the code: KIMBEACH160_PHONE, _EMAIL, _ADDRESS
  return {
    code: key, ...COUPONS[key],
    phone: process.env[`${key}_PHONE`] || '',
    email: process.env[`${key}_EMAIL`] || '',
    address: process.env[`${key}_ADDRESS`] || '',
  };
}

module.exports = { findCoupon };
