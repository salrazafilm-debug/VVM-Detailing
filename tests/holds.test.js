const assert = require('assert');
const h = require('../server/holds');
// Fake of the Supabase holds table with the same three calls the real store makes
const fake = () => { const m = new Map(); return { m,
  list: async (month) => [...m.values()].filter(r => r.date.startsWith(month)).map(r => ({ ...r })),
  insert: async (row) => { m.set(row.key, { ...row }); },
  remove: async (keys) => { keys.forEach(k => m.delete(k)); } }; };
(async () => {
  const st = fake();
  await h.addHold({ date: '2026-10-20', start: 420, end: 750, kind: 'full' }, st);
  assert.equal(st.m.size, 1);
  // hold blocks the day when Square has nothing yet
  let out = await h.blocksWithHolds({}, '2026-10', st);
  assert.deepEqual(out['2026-10-20'], [{ start: 420, end: 750, kind: 'full' }]);
  // once Square has the same booking, the hold is dropped (not double counted) and removed
  out = await h.blocksWithHolds({ '2026-10-20': [{ start: 420, end: 750, kind: 'full' }] }, '2026-10', st);
  assert.equal(out['2026-10-20'].length, 1);
  await new Promise(r => setTimeout(r, 10)); assert.equal(st.m.size, 0);
  // expired holds are ignored and cleaned up
  st.m.set('2026-10-21/1', { key: '2026-10-21/1', date: '2026-10-21', start: 420, end: 600, kind: 'exterior', expires: Date.now() - 1 });
  out = await h.blocksWithHolds({}, '2026-10', st); assert.deepEqual(out, {}); assert.equal(st.m.size, 0);
  // storage failure fails open
  const bad = { list: async () => { throw new Error('down'); } };
  assert.deepEqual(await h.blocksWithHolds({ a: [] }, '2026-10', bad), { a: [] });
  console.log('holds tests passed');
})();
