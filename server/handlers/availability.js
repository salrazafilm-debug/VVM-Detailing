const { loadCatalog, blocksByDay, json, fail, httpError, isPublic } = require('../square');
const { slotsForJobs, parsePlan, resolvePlan } = require('../rules');
const { blocksWithHolds } = require('../holds');

// ?plan=A.B,C&month=2026-11  (comma = next vehicle, dot = another service on the same vehicle)
// ?variation=A still works for one service.
exports.handler = async (event) => {
  try {
    const { plan, variation, month } = event.queryStringParameters || {};
    if (!/^\d{4}-\d{2}$/.test(month || '')) throw httpError(400, 'Invalid month.');
    const catalog = await loadCatalog();
    const { jobs } = resolvePlan(parsePlan(plan || variation), catalog, isPublic);

    const [y, m] = month.split('-').map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    const blocks = await blocksWithHolds(await blocksByDay(`${month}-01`, `${next}-01`, catalog), month);
    const now = new Date();
    const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const days = {};
    for (let d = 1; d <= total; d++) {
      const key = `${month}-${String(d).padStart(2, '0')}`;
      const slots = slotsForJobs(key, blocks[key] || [], jobs, now);
      if (slots.length) days[key] = slots;
    }
    return json(200, { days });
  } catch (e) { return fail(e); }
};
