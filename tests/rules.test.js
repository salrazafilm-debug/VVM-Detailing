const assert = require('assert');
const r = require('../server/rules');
const now = new Date('2026-10-12T04:00:00Z'); // Mon Oct 12 2026 00:00 EDT
const full = { kind: 'full', durationMin: 330, transitionMin: 0 };
const ext = { kind: 'exterior', durationMin: 90, transitionMin: 60 };
const int = { kind: 'interior', durationMin: 215, transitionMin: 0 };
const cer = { kind: 'ceramic', durationMin: 450, transitionMin: 0 };
const d = '2026-10-20';
// empty day, full detail: 7:00..14:00 every 30 min
let s = r.slotsForDay(d, [], full, now); assert.equal(s[0], '07:00'); assert.equal(s.at(-1), '14:00'); assert.equal(s.length, 15);
// one full detail 7:00-12:30 booked -> next start must be >= 12:30
s = r.slotsForDay(d, [{ start: 420, end: 750, kind: 'full' }], full, now); assert.equal(s[0], '12:30');
// two full already -> none (cap 2)
assert.deepEqual(r.slotsForDay(d, [{ start: 420, end: 750, kind: 'full' }, { start: 780, end: 1110, kind: 'full' }], ext, now), []);
// third allowed only when all short
const two = [{ start: 420, end: 600, kind: 'exterior' }, { start: 600, end: 840, kind: 'interior' }];
assert.ok(r.slotsForDay(d, two, ext, now).length > 0);
assert.deepEqual(r.slotsForDay(d, two, full, now), []);
// ceramic: needs empty day, blocks the day
assert.ok(r.slotsForDay(d, [], cer, now).length > 0);
assert.deepEqual(r.slotsForDay(d, [{ start: 420, end: 600, kind: 'exterior' }], cer, now), []);
assert.deepEqual(r.slotsForDay(d, [{ start: 420, end: 1000, kind: 'ceramic' }], ext, now), []);
// min notice: same day at 02:00 local excludes starts before 14:00
const early = new Date('2026-10-20T06:00:00Z'); // 02:00 EDT
s = r.slotsForDay(d, [], int, early); assert.equal(s[0], '14:00');
// past + too far ahead
assert.deepEqual(r.slotsForDay('2026-10-01', [], ext, now), []);
assert.deepEqual(r.slotsForDay('2028-01-01', [], ext, now), []);
// timezone round trip incl. DST change (Nov 1 2026, 2am fall back)
for (const day of ['2026-10-20', '2026-11-01', '2026-03-08']) {
  const u = r.localToUtc(day, 7 * 60); const l = r.utcToLocal(u);
  assert.equal(l.date, day); assert.equal(l.minutes, 420);
}
assert.equal(r.localToUtc('2026-10-20', 420).toISOString(), '2026-10-20T11:00:00.000Z');
// Oct 11: existing booking 11:00-16:30 -> day is closed for every service
const eleventh = [{ start: 660, end: 990, kind: 'full' }];
for (const svc of [full, ext, int, cer, { kind: 'exterior', durationMin: 75, transitionMin: 60 }]) assert.deepEqual(r.slotsForDay(d, eleventh, svc, now), []);
// Oct 14: existing 2:00 PM interior -> a morning full detail that ends by 2:00 PM is still allowed
s = r.slotsForDay(d, [{ start: 840, end: 1055, kind: 'interior' }], full, now); assert.equal(s[0], '07:00'); assert.equal(s.at(-1), '08:30');

// ---- headlight restoration + carts + two vehicles ----
assert.equal(r.kindOf('Headlight Restoration'), 'headlight');
const head = { kind: 'headlight', durationMin: 60, transitionMin: 0 };
// combining one vehicle's services into one job
const J = (kind, d, t = 0, p = 0) => ({ kind, durationMin: d, transitionMin: t, priceCents: p });
let job = r.combineJob([J('full', 330, 0, 29500), J('headlight', 60, 0, 13500)]);
assert.deepEqual([job.kind, job.durationMin, job.transitionMin, job.priceCents], ['full', 390, 0, 43000]);
assert.equal(r.combineJob([J('interior', 215), J('exterior', 90, 60)]).kind, 'full');       // interior + exterior = a full detail
assert.equal(r.combineJob([J('interior', 215), J('headlight', 60)]).kind, 'interior');       // headlight does not change a short job
assert.equal(r.combineJob([J('headlight', 60)]).kind, 'headlight');
assert.equal(r.combineJob([J('exterior', 90, 60), J('headlight', 60)]).transitionMin, 60);    // transition counted once, the longest one
assert.equal(r.combineJob([J('ceramic', 450), J('headlight', 60)]).kind, 'ceramic');
// plan strings
assert.deepEqual(r.parsePlan('A.B,C'), [['A', 'B'], ['C']]);
assert.deepEqual(r.parsePlan('A'), [['A']]);
assert.deepEqual(r.parsePlan(''), []);
assert.deepEqual(r.parsePlan(undefined), []);
// cart rules
const mk = (id, item, kind, d, extra = {}) => ({ id, item, label: 'x', kind, durationMin: d, transitionMin: 0, priceCents: 10000, bookable: true, ...extra });
const cat = {
  F: mk('F', 'Full Factory Reset', 'full', 330), I: mk('I', 'Interior Reset', 'interior', 215), E: mk('E', 'Exterior Reset', 'exterior', 90, { transitionMin: 60 }),
  H: mk('H', 'Headlight Restoration', 'headlight', 60), C: mk('C', 'Paint Enhancement + 5 yr Ceramic coating', 'ceramic', 450),
  M: mk('M', 'Maintenance Plan', 'full', 255), Z: mk('Z', 'Headlight Restoration', 'headlight', 60, { bookable: false }),
};
const pub = v => v.kind !== 'other' && !/maintenance/i.test(v.item);
const bad = (plan, re) => assert.throws(() => r.resolvePlan(plan, cat, pub), e => e.status === 400 && re.test(e.message), JSON.stringify(plan));
assert.equal(r.resolvePlan([['F', 'H']], cat, pub).jobs[0].durationMin, 390);
assert.equal(r.resolvePlan([['I', 'E']], cat, pub).jobs[0].kind, 'full');
assert.equal(r.resolvePlan([['F'], ['H']], cat, pub).jobs.length, 2);
bad([], /pick a service/i); bad(undefined, /pick a service/i); bad([[]], /service for each/i);
bad([['F'], ['I'], ['E']], /3 or more vehicles/i);          // 3+ vehicles are never booked online
bad([['H', 'H']], /once per vehicle/i);                      // same service twice
bad([['C', 'H']], /whole day/i); bad([['C'], ['H']], /whole day/i); bad([['F'], ['C']], /whole day/i);   // ceramic stands alone
bad([['F', 'I']], /already includes/i); bad([['F', 'E']], /already includes/i);
bad([['M']], /unknown service/i);                            // maintenance plan is never public
bad([['Z']], /unknown service/i);                            // not bookable in Square
bad([['nope']], /unknown service/i);
assert.equal(r.resolvePlan([['F', 'H', 'I'].slice(0, 2), ['I', 'E', 'H']], cat, pub).cars.length, 2);
// back to back
assert.deepEqual(r.partyBlocks(420, [J('full', 330), J('exterior', 90, 60)]), [{ start: 420, end: 750, kind: 'full' }, { start: 750, end: 900, kind: 'exterior' }]);
// one headlight job: an empty day offers every half hour up to 2:00 PM
s = r.slotsForJobs(d, [], [head], now); assert.equal(s[0], '07:00'); assert.equal(s.at(-1), '14:00');
// two vehicles, same day, back to back: the second job must also fit before an existing booking
const twoExt = [J('exterior', 90, 60), J('exterior', 90, 60)];                       // 150 + 150 = 300 minutes
s = r.slotsForJobs(d, [], twoExt, now); assert.equal(s[0], '07:00'); assert.equal(s.at(-1), '14:00');
s = r.slotsForJobs(d, [{ start: 720, end: 900, kind: 'interior' }], twoExt, now);    // existing 12:00-3:00 PM short job: 3 short jobs allowed
assert.ok(s.includes('07:00')); assert.ok(!s.includes('08:00'));                      // 7:00 + 300 min = 12:00 fits, 8:00 would overlap
// two vehicles use two of the daily slots: an existing full detail leaves no room for a pair of full details
assert.deepEqual(r.slotsForJobs(d, [{ start: 420, end: 750, kind: 'full' }], [J('full', 330), J('full', 330)], now), []);
assert.deepEqual(r.slotsForJobs(d, [{ start: 420, end: 750, kind: 'full' }], twoExt, now), []);   // full + 2 short = 3 jobs, not all short
// a pair of full details on an empty day is fine (two bookings)
assert.ok(r.slotsForJobs(d, [], [J('full', 330), J('full', 330)], now).length > 0);
// ceramic never pairs up
assert.deepEqual(r.slotsForJobs(d, [], [J('ceramic', 450), J('headlight', 60)], now), []);
// a cart on one vehicle (full + headlight) is one booking of 390 minutes
s = r.slotsForJobs(d, [{ start: 840, end: 1055, kind: 'interior' }], [job], now); assert.equal(s[0], '07:00'); assert.ok(!s.includes('08:00'));
console.log('all rule tests passed');

// engine bay is a bookable add-on like headlight
assert.equal(r.kindOf('Engine Bay Detail'), 'engine');
assert.equal(r.combineJob([{kind:'interior',durationMin:215,transitionMin:0,priceCents:0},{kind:'engine',durationMin:90,transitionMin:0,priceCents:0}]).kind, 'interior');
assert.equal(r.combineJob([{kind:'engine',durationMin:90,transitionMin:0,priceCents:0}]).kind, 'engine');
console.log('engine bay tests passed');
