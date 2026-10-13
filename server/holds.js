// Holds: a reserved time is blocked on the site right away, before it is entered in Square.
// A hold disappears when a Square booking appears at the same time, or after HOLD_DAYS.
// Holds live in the Supabase `holds` table (see supabase/schema.sql). Everything here fails open:
// if the database is unavailable the site still works, just without holds.
const TTL_MS = Number(process.env.HOLD_DAYS || 3) * 86400000;

// Fills in the default store (Supabase) when none is passed in, so tests can use a fake one.
function defaultStore() {
  return require('./holds-db').store();
}

// Returns { [date]: [{ start, end, kind, key }] } for holds still in force for the month.
async function readHolds(store, month, now = Date.now()) {
  const out = {};
  const rows = await store.list(month);
  const expired = [];
  for (const h of rows) {
    if (h.expires < now) { expired.push(h.key); continue; }
    (out[h.date] = out[h.date] || []).push(h);
  }
  if (expired.length) await store.remove(expired).catch(() => {});
  return out;
}

// days: Square blocks by date. Holds already covered by a Square booking at the same start are dropped.
function mergeHolds(days, holds) {
  const merged = {};
  for (const [d, list] of Object.entries(days)) merged[d] = [...list];
  const obsolete = [];
  for (const [date, list] of Object.entries(holds)) {
    for (const h of list) {
      if ((days[date] || []).some(b => Math.abs(b.start - h.start) <= 30)) { obsolete.push(h.key); continue; }
      (merged[date] = merged[date] || []).push({ start: h.start, end: h.end, kind: h.kind });
    }
  }
  return { merged, obsolete };
}

async function blocksWithHolds(days, month, store) {
  try {
    store = store || defaultStore();
    const { merged, obsolete } = mergeHolds(days, await readHolds(store, month));
    if (obsolete.length) store.remove(obsolete).catch(() => {});
    return merged;
  } catch (e) {
    console.error('holds unavailable:', e.message);
    return days;
  }
}

async function addHold(hold, store) {
  try {
    store = store || defaultStore();
    const key = `${hold.date}/${hold.start}-${Math.random().toString(36).slice(2, 8)}`;
    await store.insert({ key, date: hold.date, start: hold.start, end: hold.end, kind: hold.kind, expires: Date.now() + TTL_MS });
  } catch (e) {
    console.error('could not save hold:', e.message);
  }
}

module.exports = { blocksWithHolds, addHold, mergeHolds, readHolds };
