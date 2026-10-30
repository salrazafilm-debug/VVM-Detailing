const assert = require('node:assert/strict');
const t = require('../server/travel');

// Fee tiers: 30 or less free, 31-45 $20, 46-49 $25, 50-70 $30
assert.equal(t.travelFeeCents(0), 0);
assert.equal(t.travelFeeCents(30), 0);
assert.equal(t.travelFeeCents(31), 2000);
assert.equal(t.travelFeeCents(45), 2000);
assert.equal(t.travelFeeCents(46), 2500);
assert.equal(t.travelFeeCents(49), 2500);
assert.equal(t.travelFeeCents(50), 3000);
assert.equal(t.travelFeeCents(70), 3000);

// The family area never pays a travel fee and gets the family discount flag
const home = t.lookupZip('20732');
assert.ok(home.ok && home.family && home.feeCents === 0);
for (const z of ['20732', '20714', '20639', '20736', '20754', '20678']) { const r = t.lookupZip(z); assert.ok(r.ok && r.family && r.feeCents === 0, 'family ZIP ' + z); }
// Lusby and St. Leonard are not on the map, so they are not the family area
assert.ok(!t.lookupZip('20657').family && !t.lookupZip('20685').family);
assert.equal(t.lookupZip('20685').feeCents, 2000, 'St. Leonard is a paid trip');
// A ZIP farther than 70 minutes is not booked online; a ZIP we do not know says so
assert.ok(!t.lookupZip('22101').ok && t.lookupZip('22101').tooFar);
assert.ok(!t.lookupZip('99999').ok && !t.lookupZip('99999').known);
assert.ok(!t.lookupZip('12').ok);
// DC is a paid trip
const dc = t.lookupZip('20001');
assert.ok(dc.ok && !dc.family && dc.feeCents >= 2500);

// One discount: the biggest wins; none stack
assert.equal(t.bestDiscount([{ kind: 'family', cents: 2500 }, { kind: 'code', cents: 4000 }]).kind, 'code');
assert.equal(t.bestDiscount([{ kind: 'family', cents: 2500 }, { kind: 'referral', cents: 2000 }]).kind, 'family');
assert.equal(t.bestDiscount([null, { kind: 'x', cents: 0 }]), null);

// Total: discount comes off the services, the travel fee is added after
assert.deepEqual(t.priceBooking({ servicesCents: 20000, feeCents: 2000, discount: { cents: 3000 } }), { servicesCents: 20000, feeCents: 2000, discountCents: 3000, totalCents: 19000 });
assert.equal(t.priceBooking({ servicesCents: 2000, feeCents: 0, discount: { cents: 5000 } }).totalCents, 0);
console.log('Travel fee, family area and discount rules passed.');
