const assert = require('node:assert/strict');
process.env.SQUARE_ACCESS_TOKEN = 'test'; process.env.SQUARE_LOCATION_ID = 'L1';
const realFetch = global.fetch;
const bookings = [
  // Blocked whole day Wed Nov 18 (local), no service, no segments: Square gives start and end
  { status: 'ACCEPTED', start_at: '2026-11-18T05:00:00Z', end_at: '2026-11-19T05:00:00Z' },
  // Blocked Thu-Fri Nov 19 13:00 to Nov 20 12:00 local (EST is UTC-5)
  { status: 'ACCEPTED', start_at: '2026-11-19T18:00:00Z', end_at: '2026-11-20T17:00:00Z' },
  // A cancelled block is ignored
  { status: 'CANCELLED_BY_CUSTOMER', start_at: '2026-11-21T14:00:00Z', end_at: '2026-11-21T20:00:00Z' },
  // A normal service booking, with a 30 min transition
  { status: 'ACCEPTED', start_at: '2026-11-16T14:00:00Z', appointment_segments: [{ service_variation_id: 'SV', duration_minutes: 120 }], transition_time_minutes: 30 },
];
global.fetch = async () => ({ ok: true, json: async () => ({ bookings }) });
const { blocksByDay } = require('../server/square');
(async () => {
  // catalog stub: the service is a 'full' job
  const days = await blocksByDay('2026-11-16', '2026-11-22', { SV: { kind: 'full', transitionMin: 0 } });
  // the whole-day block covers Nov 18 from midnight to midnight
  assert.deepEqual(days['2026-11-18'].filter(x => x.kind === 'other').map(x => [x.start, x.end]), [[0, 1440]]);
  // the two-day block: Nov 19 from 13:00 to midnight, Nov 20 from midnight to 12:00
  assert.deepEqual(days['2026-11-19'].filter(x => x.kind === 'other').map(x => [x.start, x.end]), [[780, 1440]]);
  assert.deepEqual(days['2026-11-20'].filter(x => x.kind === 'other').map(x => [x.start, x.end]), [[0, 720]]);
  // cancelled entries are not busy
  assert.equal(days['2026-11-21'], undefined);
  // the service booking keeps its length plus transition (Nov 16 9:00 to 11:30 local)
  assert.deepEqual(days['2026-11-16'].map(x => [x.kind, x.start, x.end]), [['full', 540, 690]]);
  global.fetch = realFetch;
  console.log('square block tests passed');
})().catch(e => { global.fetch = realFetch; console.error(e); process.exit(1); });
