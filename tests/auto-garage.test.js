const assert = require('node:assert/strict');
const auto = require('../server/auto-garage');

// A tiny in-memory stand-in for Supabase: tables, an auth admin and the record-service procedure.
function fakeAdmin(T, opts = {}) {
  const admin = {
    from(name) {
      const rows = T[name] || (T[name] = []);
      let filters = [], op = 'select', payload = null, lim = null;
      const q = {
        select() { return q; }, eq(k, v) { filters.push(r => r[k] === v); return q; }, limit(n) { lim = n; return q; },
        insert(v) { op = 'insert'; payload = v; return q; }, update(v) { op = 'update'; payload = v; return q; },
        upsert(v) { op = 'upsert'; payload = v; return q; },
        maybeSingle() { return run(true); }, single() { return run(true); }, then(a, b) { return run(false).then(a, b); },
      };
      async function run(single) {
        if (opts.noMigration && name === 'garage_profiles') return { data: null, error: { message: 'column garage_enabled does not exist' } };
        if (op === 'insert') { const row = { id: `${name}${rows.length + 1}`, ...payload }; rows.push(row); return { data: row, error: null }; }
        if (op === 'upsert') { const i = rows.findIndex(r => r.user_id === payload.user_id); if (i >= 0) Object.assign(rows[i], payload); else rows.push({ ...payload }); return { data: null, error: null }; }
        let m = rows.filter(r => filters.every(f => f(r)));
        if (op === 'update') { m.forEach(r => Object.assign(r, payload)); return { data: single ? m[0] || null : m, error: null }; }
        if (lim) m = m.slice(0, lim);
        return { data: single ? m[0] || null : m, error: null };
      }
      return q;
    },
    auth: { admin: {
      async createUser({ email, user_metadata }) {
        if ((T.users ||= []).some(u => u.email === email)) return { data: null, error: { code: 'email_exists', message: 'already registered' } };
        const u = { id: `u${T.users.length + 1}`, email }; T.users.push(u);
        (T.garage_profiles ||= []).push({ user_id: u.id, email, display_name: user_metadata.display_name, garage_enabled: true }); // the database trigger
        return { data: { user: u }, error: null };
      },
      async listUsers() { return { data: { users: T.users || [] }, error: null }; },
    } },
    async rpc(fn, args) {
      assert.equal(fn, 'garage_record_service');
      (T.garage_services ||= []).push({ id: `s${T.garage_services.length + 1}`, vehicle_id: args.p_vehicle_id, service_date: args.p_service_date, title: args.p_title, paint_sealant: args.p_paint_sealant });
      return { data: {}, error: null };
    },
  };
  return admin;
}

(async () => {
  // Typed car text becomes year / make / model; odd text is kept whole instead of being lost
  assert.deepEqual(auto.parseVehicle('2017 Honda CRV'), { year: 2017, make: 'Honda', model: 'CRV' });
  assert.deepEqual(auto.parseVehicle('Honda CRV 2017'), { year: 2017, make: 'Honda', model: 'CRV' });
  assert.deepEqual(auto.parseVehicle('2020 Land Rover Defender 110'), { year: 2020, make: 'Land Rover', model: 'Defender 110' });
  assert.deepEqual(auto.parseVehicle('Tesla'), { year: null, make: null, model: 'Tesla' });
  assert.equal(auto.sizeFrom('2017 Honda CRV: Full Factory Reset (SUV) + Headlight Restoration (Regular)'), 'suv');
  assert.equal(auto.sizeFrom('Interior Reset (SUV / Truck)'), 'suv');
  assert.equal(auto.sizeFrom('Full Factory Reset (Mini-Van)'), 'minivan');
  assert.equal(auto.sizeFrom('Headlight Restoration (Regular)'), null);
  assert.equal(auto.servicesByVehicle('A: x | B: y', 2).length, 2);
  assert.equal(auto.servicesByVehicle('A: x', 2), null);

  const booking = { id: 'b1', name: 'Lori Smith', email: 'Tlori66@Gmail.com', phone: '7573554215', address: '8410 Upper Sky Way, Apt 232 Laurel, MD 20723', vehicles: '2017 Honda CRV', services: '2017 Honda CRV: Full Factory Reset (SUV) + Headlight Restoration (Regular)', booking_date: '2026-11-03' };

  // Before the Supabase update is run: nothing is created, and the owner is told
  {
    const T = { users: [], booking_requests: [booking] };
    const r = await auto.createFromBooking(fakeAdmin(T, { noMigration: true }), booking);
    assert.equal(r.ok, false); assert.match(r.note, /Supabase/); assert.equal(T.users.length, 0);
  }

  // Confirm: login, OFF garage, address and phone filled, car added, no services recorded yet
  const T = { users: [], garage_profiles: [], garage_vehicles: [], garage_services: [], booking_requests: [{ ...booking }] };
  const admin = fakeAdmin(T);
  const made = await auto.createFromBooking(admin, booking);
  assert.equal(made.ok, true); assert.equal(made.isNew, true);
  const prof = T.garage_profiles[0];
  assert.equal(prof.garage_enabled, false, 'new Garages start OFF');
  assert.equal(prof.location, booking.address); assert.equal(prof.phone, '7573554215'); assert.equal(prof.email, 'tlori66@gmail.com');
  assert.equal(T.garage_vehicles.length, 1);
  assert.deepEqual([T.garage_vehicles[0].year, T.garage_vehicles[0].make, T.garage_vehicles[0].model, T.garage_vehicles[0].vehicle_size, T.garage_vehicles[0].show_vehicle_name], [2017, 'Honda', 'CRV', 'suv', false]);
  assert.equal(T.garage_services.length, 0, 'nothing is "done" until the detail is completed');
  assert.equal(T.booking_requests[0].garage_user_id, prof.user_id);

  // Confirming again (reopen then confirm) does not double anything
  const again = await auto.createFromBooking(admin, { ...booking, garage_user_id: prof.user_id });
  assert.equal(again.ok, true); assert.equal(again.isNew, false);
  assert.equal(T.garage_vehicles.length, 1); assert.equal(T.users.length, 1);

  // A returning client keeps their Garage (and its ON/OFF setting); a second booking finds them by email
  const second = await auto.createFromBooking(admin, { ...booking, id: 'b2', garage_user_id: null });
  assert.equal(second.isNew, false); assert.equal(T.users.length, 1); assert.equal(T.garage_vehicles.length, 1);

  // Mark completed: Full Factory Reset is recorded WITH the sealant; Headlight Restoration is not recorded
  const done = await auto.recordCompleted(admin, 'b1');
  assert.match(done.note, /recorded \(1\)/);
  assert.equal(T.garage_services.length, 1);
  assert.deepEqual([T.garage_services[0].title, T.garage_services[0].paint_sealant, T.garage_services[0].service_date], ['Full Factory Reset', true, '2026-11-03']);
  // Twice is the same as once
  await auto.recordCompleted(admin, 'b1');
  assert.equal(T.garage_services.length, 1);

  // No Full Factory Reset in the booking: nothing is recorded
  T.booking_requests.push({ ...booking, id: 'b3', garage_user_id: prof.user_id, services: '2017 Honda CRV: Interior Reset (SUV / Truck)' });
  assert.equal((await auto.recordCompleted(admin, 'b3')).note, '');
  assert.equal(T.garage_services.length, 1);

  // Two cars: each car gets its own services, and only the car that had the reset gets it
  const two = { id: 'b4', name: 'Sam Ray', email: 'sam@x.com', vehicles: '2019 Toyota Camry | 2015 Ford F-150', services: 'Vehicle 1 (2019 Toyota Camry): Exterior Reset (Sedan) | Vehicle 2 (2015 Ford F-150): Full Factory Reset (Truck)', booking_date: '2026-11-04' };
  T.booking_requests.push({ ...two });
  const m2 = await auto.createFromBooking(admin, two);
  assert.equal(m2.ok, true); assert.equal(T.garage_vehicles.length, 3);
  const camry = T.garage_vehicles.find(v => v.model === 'Camry'), ford = T.garage_vehicles.find(v => v.model === 'F-150');
  assert.equal(camry.vehicle_size, 'sedan'); assert.equal(ford.vehicle_size, 'truck');
  await auto.recordCompleted(admin, 'b4');
  const added = T.garage_services.filter(s => s.vehicle_id !== T.garage_vehicles[0].id);
  assert.equal(added.length, 1); assert.equal(added[0].vehicle_id, ford.id);

  // Turn ON: no email key here, so it says so, and the Garage is still turned on. OFF again works too.
  delete process.env.BREVO_API_KEY;
  admin.auth.admin.generateLink = async () => ({ data: { properties: { action_link: 'https://example.test/link' } }, error: null });
  const on = await auto.setEnabled(admin, prof.user_id, true);
  assert.equal(on.ok, true); assert.match(on.message, /No email was sent/);
  assert.equal(T.garage_profiles[0].garage_enabled, true); assert.equal(T.garage_profiles[0].garage_invited_at, undefined);
  const off = await auto.setEnabled(admin, prof.user_id, false);
  assert.equal(off.ok, true); assert.equal(T.garage_profiles[0].garage_enabled, false);

  console.log('auto-garage tests passed');
})().catch(e => { console.error(e); process.exit(1); });
