// Thin Square API client plus the helpers the functions share.
const { kindOf, localToUtc, utcToLocal, CFG } = require('./rules');
const { STATIC_CATALOG } = require('./catalog-static');

const BASE = process.env.SQUARE_ENV === 'sandbox' ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com';
const VERSION = '2025-10-16';
const BOOKABLE = new Set(['full', 'interior', 'exterior', 'headlight', 'engine', 'ceramic']);
// What customers may pick online. The Maintenance Plan is for returning clients only, so the owner books it
// by hand in Square. It still blocks time as a 'full' job (see kindOf) but is never offered or accepted here.
const isPublic = v => BOOKABLE.has(v.kind) && !/maintenance/i.test(v.item);

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

async function sq(path, { method = 'GET', body } = {}) {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) throw httpError(503, 'Online booking is not set up yet.');
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Square-Version': VERSION, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = httpError(r.status, (j.errors && j.errors[0] && j.errors[0].detail) || 'Square request failed.');
    e.square = j.errors;
    throw e;
  }
  return j;
}

// Prices and durations come from catalog-static.js, not from Square (edit them there).
async function loadCatalog() {
  return STATIC_CATALOG;
}

let locationCache;
async function getLocationId() {
  if (process.env.SQUARE_LOCATION_ID) return process.env.SQUARE_LOCATION_ID;
  if (!locationCache) locationCache = (await sq('/v2/locations')).locations[0].id;
  return locationCache;
}

// Bookings that start between two local dates (end exclusive), as per-day blocks
async function blocksByDay(fromDate, toDate, catalog) {
  const loc = await getLocationId();
  const min = localToUtc(fromDate, 0).toISOString();
  const max = localToUtc(toDate, 0).toISOString();
  const days = {};
  let cursor;
  do {
    const q = new URLSearchParams({ location_id: loc, start_at_min: min, start_at_max: max, limit: '200' });
    if (cursor) q.set('cursor', cursor);
    const res = await sq('/v2/bookings?' + q);
    for (const b of res.bookings || []) {
      if (!['PENDING', 'ACCEPTED'].includes(b.status)) continue;
      const segs = b.appointment_segments || [];
      const first = catalog[(segs[0] || {}).service_variation_id];
      const minutes = segs.reduce((n, s) => n + (s.duration_minutes || 0) + (s.intermission_minutes || 0), 0);
      const local = utcToLocal(new Date(b.start_at));
      (days[local.date] = days[local.date] || []).push({
        start: local.minutes,
        end: local.minutes + minutes + (b.transition_time_minutes || (first ? first.transitionMin : 0)),
        kind: first ? first.kind : 'other',
      });
    }
    cursor = res.cursor;
  } while (cursor);
  return days;
}

const json = (status, body) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});
const fail = e => { if (!e.status || e.status >= 500 || e.square) console.error('request failed', e.status, e.message, JSON.stringify(e.square || ''), 'env=' + (process.env.SQUARE_ENV || 'unset')); return failJson(e); };
const failJson = e => json(e.status && e.status < 600 ? e.status : 500, { error: e.status && e.status < 500 ? e.message : 'Something went wrong. Please call or text us to book.' });

module.exports = { sq, loadCatalog, getLocationId, blocksByDay, json, fail, httpError, BOOKABLE, isPublic, CFG };
