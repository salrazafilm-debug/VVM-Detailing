// Pure booking rules. No network calls, so they can be tested offline.
const TZ = 'America/New_York';
const CFG = {
  firstStart: 7 * 60,   // 7:00 AM
  lastStart: 14 * 60,   // 2:00 PM
  step: 30,             // minutes between offered start times
  maxPerDay: 2,
  maxShortPerDay: 3,    // allowed only when every job that day is interior-only or exterior-only
  minNoticeHours: Number(process.env.MIN_NOTICE_HOURS || 12),
  maxDaysAhead: Number(process.env.MAX_DAYS_AHEAD || 365),
  // A new job may only go before an existing booking if the free time before it is at least this long.
  // Stops short jobs being squeezed in ahead of a late-morning booking.
  minWindowMin: Number(process.env.MIN_WINDOW_MIN || 300),
};

const dtf = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});
function parts(d) {
  const p = Object.fromEntries(dtf.formatToParts(d).map(x => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}
const pad = n => String(n).padStart(2, '0');
function offsetMinutes(d) {
  const p = parts(d);
  return (Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - d.getTime()) / 60000;
}
// 'YYYY-MM-DD' + minutes after local midnight -> UTC Date
function localToUtc(dateStr, minutes) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, 0, minutes));
  let utc = new Date(guess.getTime() - offsetMinutes(guess) * 60000);
  const off2 = offsetMinutes(utc);
  utc = new Date(guess.getTime() - off2 * 60000);
  return utc;
}
function utcToLocal(date) {
  const p = parts(date);
  return { date: `${p.y}-${pad(p.mo)}-${pad(p.d)}`, minutes: p.h * 60 + p.mi };
}
const toHHMM = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const fromHHMM = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

function kindOf(itemName) {
  const n = String(itemName || '').toLowerCase();
  if (n.includes('full factory')) return 'full';
  if (n.includes('paint enhancement') || n.includes('ceramic coating')) return 'ceramic';
  if (n.startsWith('interior')) return 'interior';
  if (n.startsWith('exterior')) return 'exterior';
  if (n.includes('maintenance')) return 'full';
  if (n.includes('headlight')) return 'headlight';
  if (n.includes('engine')) return 'engine';
  return 'other';
}
// Short jobs may stack three to a day (see maxShortPerDay). A headlight restoration is about an hour.
const isShort = k => k === 'interior' || k === 'exterior' || k === 'headlight' || k === 'engine';

// ---- carts: one or two vehicles, each with one or more services ----
const MAX_CARS = 2;       // 3 or more vehicles: the customer is sent to text/email us
const MAX_PER_CAR = 4;    // services per vehicle

// "A.B,C" -> [['A','B'],['C']]  (comma between vehicles, dot between services on one vehicle)
function parsePlan(s) {
  return String(s || '').split(',').map(c => c.split('.').map(x => x.trim()).filter(Boolean)).filter(c => c.length);
}

// One vehicle's services become a single job. Full/ceramic dominate; interior + exterior together act like a full detail.
function combineKind(kinds) {
  if (kinds.includes('ceramic')) return 'ceramic';
  const core = kinds.filter(k => k !== 'headlight' && k !== 'engine');   // headlight and engine bay are add-ons
  if (core.includes('full') || (core.includes('interior') && core.includes('exterior'))) return 'full';
  return core.length ? core[0] : kinds[0];
}
function combineJob(services) {
  return {
    kind: combineKind(services.map(s => s.kind)),
    durationMin: services.reduce((n, s) => n + s.durationMin, 0),
    transitionMin: Math.max(0, ...services.map(s => s.transitionMin || 0)),
    priceCents: services.reduce((n, s) => n + (s.priceCents || 0), 0),
    latestStart: services.some(s => s.latestStart != null) ? Math.min(...services.filter(s => s.latestStart != null).map(s => s.latestStart)) : undefined,
  };
}

// plan: [[variationId, ...], ...]; catalog: id -> variation; isPublic: variation -> boolean.
// Throws an Error with status 400 and a customer-friendly message when the cart is not allowed.
function resolvePlan(plan, catalog, isPublic) {
  const fail = m => { const e = new Error(m); e.status = 400; throw e; };
  if (!Array.isArray(plan) || !plan.length) fail('Please pick a service.');
  if (plan.length > MAX_CARS) fail('For 3 or more vehicles, please text or email us.');
  const cars = plan.map(ids => {
    if (!Array.isArray(ids) || !ids.length || ids.length > MAX_PER_CAR) fail('Please pick a service for each vehicle.');
    const services = ids.map(id => {
      const v = catalog[id];
      if (!v || !isPublic(v) || !v.bookable || !v.durationMin) fail('Unknown service.');
      return v;
    });
    if (new Set(services.map(v => v.item)).size !== services.length) fail('Pick each service once per vehicle.');
    const kinds = services.map(v => v.kind);
    if (kinds.includes('ceramic') && (services.length > 1 || plan.length > 1)) fail('Ceramic coating takes the whole day, so it is booked on its own. Please text or email us to combine it.');
    if (kinds.includes('full') && (kinds.includes('interior') || kinds.includes('exterior'))) fail('The Full Factory Reset already includes the Interior and Exterior Reset.');
    return { services, job: combineJob(services) };
  });
  return { cars, jobs: cars.map(c => c.job) };
}

// Where each vehicle's job sits when they are done back to back starting at `start` (minutes after midnight).
function partyBlocks(start, jobs) {
  let s = start;
  return jobs.map(j => { const b = { start: s, end: s + j.durationMin + (j.transitionMin || 0), kind: j.kind }; s = b.end; return b; });
}

function daysFromToday(dateStr, now) {
  const today = utcToLocal(now).date;
  const a = Date.UTC(...today.split('-').map((v, i) => i === 1 ? v - 1 : +v));
  const b = Date.UTC(...dateStr.split('-').map((v, i) => i === 1 ? v - 1 : +v));
  return Math.round((b - a) / 86400000);
}

// dayBlocks: [{ start, end, kind }] in minutes after local midnight (end includes transition time)
// jobs: [{ kind, durationMin, transitionMin }], one per vehicle, done back to back from the chosen start.
// Each vehicle counts as one booking toward the daily limit.
function slotsForJobs(dateStr, dayBlocks, jobs, now, cfg = CFG) {
  const ahead = daysFromToday(dateStr, now);
  if (ahead < 0 || ahead > cfg.maxDaysAhead) return [];
  if (dayBlocks.some(b => b.kind === 'ceramic')) return [];
  if (jobs.some(j => j.kind === 'ceramic') && (dayBlocks.length > 0 || jobs.length > 1)) return [];
  const kinds = [...dayBlocks.map(b => b.kind), ...jobs.map(j => j.kind)];
  const cap = kinds.every(isShort) ? cfg.maxShortPerDay : cfg.maxPerDay;
  if (kinds.length > cap) return [];

  const length = jobs.reduce((n, j) => n + j.durationMin + (j.transitionMin || 0), 0);
  // Some jobs must start early (paint correction is morning only, the bundle must start 7-8 AM)
  const lastStart = Math.min(cfg.lastStart, ...jobs.map(j => j.latestStart ?? Infinity));
  const earliest = now.getTime() + cfg.minNoticeHours * 3600000;
  const out = [];
  for (let s = cfg.firstStart; s <= lastStart; s += cfg.step) {
    if (localToUtc(dateStr, s).getTime() < earliest) continue;
    const e = s + length;
    if (dayBlocks.some(b => s < b.end && e > b.start)) continue;
    const next = dayBlocks.filter(b => b.start >= s).sort((a, b) => a.start - b.start)[0];
    if (next) {
      const prevEnd = Math.max(0, ...dayBlocks.filter(b => b.end <= s).map(b => b.end));
      if (next.start - Math.max(cfg.firstStart, prevEnd) < cfg.minWindowMin) continue;
    }
    out.push(toHHMM(s));
  }
  return out;
}

// One vehicle, one job (kept for the existing callers and tests).
const slotsForDay = (dateStr, dayBlocks, service, now, cfg = CFG) => slotsForJobs(dateStr, dayBlocks, [service], now, cfg);

module.exports = {
  CFG, TZ, localToUtc, utcToLocal, toHHMM, fromHHMM, kindOf, slotsForDay, slotsForJobs, daysFromToday,
  MAX_CARS, MAX_PER_CAR, parsePlan, combineJob, resolvePlan, partyBlocks,
};
