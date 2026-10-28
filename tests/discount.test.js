const assert = require('node:assert/strict');
const { normalizeDiscount } = require('../server/coupon-db');

// Codes are typed loosely: spaces and lower case still find the same code.
assert.equal(normalizeDiscount(' save$40 '), 'SAVE$40');
assert.equal(normalizeDiscount('save 40'), 'SAVE40');
assert.equal(normalizeDiscount(''), '');
assert.equal(normalizeDiscount(undefined), '');

// What the admin page accepts as a code: 3 to 20 letters, numbers, $ or -
const allowed = code => /^[A-Z0-9$-]{3,20}$/.test(code);
assert.ok(allowed('SAVE$40') && allowed('SAVE40') && allowed('WELCOME-2026'));
assert.ok(!allowed('AB') && !allowed('SAVE 40') && !allowed('A'.repeat(21)) && !allowed('SAVE!'));

console.log('Discount code rules passed.');
