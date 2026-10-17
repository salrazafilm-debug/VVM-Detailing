const assert = require('assert');
const { findCoupon } = require('../server/coupons');
assert.equal(findCoupon('KIMBEACH155').priceCents, 15500);
assert.equal(findCoupon(' kimbeach155 ').item, 'Full Factory Reset');
assert.equal(findCoupon('KIMBEACH155').label, 'SUV');
assert.equal(findCoupon('NOPE'), null);
assert.equal(findCoupon(''), null);
assert.equal(findCoupon('__proto__'), null);
console.log('coupon tests passed');
