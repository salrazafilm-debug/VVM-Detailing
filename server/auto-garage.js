// Auto-Garage. Confirming a booking makes the client's Garage from the booking (name, email, phone, address, car).
// The Garage starts OFF: the client cannot open it until the owner turns it on in admin (setEnabled), which also
// emails them a link to choose a password. Marking the booking completed records the Full Factory Reset, which
// includes the exterior ceramic sealant, so the maintenance membership starts. Nothing else is recorded as done.
const crypto = require('node:crypto');
const customerMail = require('./customer-mail');

const TWO_WORD_MAKES = ['land rover', 'range rover', 'alfa romeo', 'aston martin', 'rolls royce', 'mercedes benz'];
const SIZE_WORDS = [['mini van', 'minivan'], ['minivan', 'minivan'], ['coupe', 'coupe'], ['sedan', 'sedan'], ['suv', 'suv'], ['truck', 'truck']];
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const FULL_RESET = 'Full Factory Reset';

const easternToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const clip = (s, n) => String(s || '').trim().slice(0, n);

// "2017 Honda CRV" -> { year: 2017, make: 'Honda', model: 'CRV' }. Typed text, so anything odd falls back to the whole text as the model.
function parseVehicle(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  const ym = t.match(/\b(19\d{2}|20\d{2})\b/);
  let year = ym ? Number(ym[1]) : null;
  if (year && year > new Date().getFullYear() + 1) year = null;
  const words = (ym && year ? t.replace(ym[0], '') : t).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length < 2) return { year, make: null, model: clip(words.join(' ') || t || 'Vehicle', 100) };
  const n = TWO_WORD_MAKES.includes(words.slice(0, 2).join(' ').toLowerCase().replace('-', ' ')) ? 2 : 1;
  return { year, make: clip(words.slice(0, n).join(' '), 80), model: clip(words.slice(n).join(' ') || words.join(' '), 100) };
}

// "Full Factory Reset (SUV) + Headlight Restoration (Regular)" -> 'suv'. Only the bracketed size labels count.
function sizeFrom(segment) {
  for (const m of String(segment || '').matchAll(/\(([^)]*)\)/g)) {
    const label = m[1].toLowerCase().replace('-', ' ');
    const hit = SIZE_WORDS.find(([w]) => label.includes(w));
    if (hit) return hit[1];
  }
  return null;
}

// The booking keeps one services text ("Vehicle 1 (...): ... | Vehicle 2 (...): ..."). Returns one piece per car, or null if unsure.
function servicesByVehicle(services, count) {
  const parts = String(services || '').split(' | ').map(s => s.trim()).filter(Boolean);
  if (count === 1) return [parts.join(' | ')];
  return parts.length === count ? parts : null;
}

const vehicleTexts = row => String(row.vehicles || '').split(' | ').map(s => s.trim()).filter(Boolean);
const sameCar = (v, p) => (v.year ?? null) === (p.year ?? null) && String(v.model || '').toLowerCase() === p.model.toLowerCase();

async function findUserId(admin, email) {
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) return null;
    const user = data.users.find(u => u.email?.toLowerCase() === email);
    if (user) return user.id;
    if (data.users.length < 100) return null;
  }
  return null;
}

// Called when the owner confirms a booking. Never throws for expected problems: returns { ok, note } for admin to show.
async function createFromBooking(admin, row) {
  const email = String(row.email || '').trim().toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, note: 'No Garage made: the booking has no valid email.' };
  // Fails here, before any login is created, if the one-time Supabase update has not been run yet.
  const probe = await admin.from('garage_profiles').select('garage_enabled').limit(1);
  if (probe.error) return { ok: false, note: 'No Garage made yet: run the "auto garage" update in Supabase first (see GARAGE_SETUP.md).' };

  const name = clip(row.name, 120);
  let userId = row.garage_user_id || null, isNew = false;
  if (!userId) {
    const { data: found } = await admin.from('garage_profiles').select('user_id').eq('email', email).maybeSingle();
    if (found) userId = found.user_id;
  }
  if (!userId) {
    // Nobody knows this password: the client picks their own when the Garage is turned on.
    const made = await admin.auth.admin.createUser({ email, password: crypto.randomBytes(24).toString('base64url'), email_confirm: true, user_metadata: { display_name: name } });
    if (made.error) userId = await findUserId(admin, email);
    else { userId = made.data.user.id; isNew = true; }
    if (!userId) return { ok: false, note: 'No Garage made: could not create the login.' };
  }

  const { data: cur } = await admin.from('garage_profiles').select('phone,location,display_name').eq('user_id', userId).maybeSingle();
  const fill = isNew ? { garage_enabled: false } : {};
  if (!cur?.display_name && name) fill.display_name = name;
  if (!cur?.phone && row.phone) fill.phone = clip(row.phone, 40);
  if (!cur?.location && row.address) fill.location = clip(row.address, 200);
  if (isNew || Object.keys(fill).length) {
    const { error } = await admin.from('garage_profiles').upsert({ user_id: userId, email, display_name: name, ...fill }, { onConflict: 'user_id' });
    if (error) return { ok: false, note: 'No Garage made: could not save the profile.' };
  }

  const texts = vehicleTexts(row), segs = servicesByVehicle(row.services, texts.length);
  const { data: have } = await admin.from('garage_vehicles').select('id,year,model').eq('customer_id', userId);
  const cars = have || [];
  let added = 0;
  for (let i = 0; i < texts.length; i++) {
    const p = parseVehicle(texts[i]);
    if (cars.some(v => sameCar(v, p))) continue;
    const { data: v, error } = await admin.from('garage_vehicles').insert({ customer_id: userId, year: p.year, make: p.make, model: p.model, vehicle_size: sizeFrom(segs?.[i]), show_vehicle_name: false }).select('id,year,model').single();
    if (error) return { ok: false, note: 'Garage login made, but the car could not be added. Add it under Clients.' };
    cars.push(v); added++;
  }
  await admin.from('booking_requests').update({ garage_user_id: userId }).eq('id', row.id);
  const who = name || email;
  return { ok: true, userId, isNew, note: isNew ? `Garage made for ${who}. It stays OFF until you turn it on under Clients.` : `Garage for ${who} already existed${added ? ' (car added)' : ''}.` };
}

// Called when the owner marks the booking completed. Records only the Full Factory Reset, with its exterior ceramic sealant.
async function recordCompleted(admin, bookingId) {
  const { data: row } = await admin.from('booking_requests').select('*').eq('id', bookingId).maybeSingle();
  if (!row || !row.garage_user_id) return { note: '' };
  const texts = vehicleTexts(row), segs = servicesByVehicle(row.services, texts.length);
  if (!segs) return { note: 'Garage: 2 cars on one booking, so add their services by hand under Clients.' };
  const { data: cars } = await admin.from('garage_vehicles').select('id,year,model').eq('customer_id', row.garage_user_id);
  const today = easternToday();
  const date = row.booking_date && row.booking_date < today ? row.booking_date : today;
  let recorded = 0;
  for (let i = 0; i < texts.length; i++) {
    if (!segs[i].toLowerCase().includes(FULL_RESET.toLowerCase())) continue;
    const car = (cars || []).find(v => sameCar(v, parseVehicle(texts[i])));
    if (!car) continue;
    const { data: dup } = await admin.from('garage_services').select('id').eq('vehicle_id', car.id).eq('service_date', date).eq('title', FULL_RESET);
    if (dup && dup.length) continue;
    const { error } = await admin.rpc('garage_record_service', { p_vehicle_id: car.id, p_service_date: date, p_title: FULL_RESET, p_description: 'Full detail with exterior ceramic sealant.', p_paint_sealant: true, p_ceramic_coating: false, p_leather_protection: false, p_fabric_protection: false });
    if (error) return { note: 'Garage: could not record the Full Factory Reset. Add it under Clients.' };
    recorded++;
  }
  return { note: recorded ? `Garage: Full Factory Reset and sealant recorded (${recorded}).` : '' };
}

// Turns a client's Garage on or off. The first time it goes on, the client is emailed a link to choose a password.
async function setEnabled(admin, customerId, enabled) {
  const { data: prof, error } = await admin.from('garage_profiles').select('user_id,email,display_name,garage_invited_at').eq('user_id', customerId).maybeSingle();
  if (error || !prof) return { ok: false, status: 503, message: 'Could not find this client. Run the "auto garage" update in Supabase first.' };
  const patch = { garage_enabled: enabled === true };
  let note = '';
  if (enabled === true && !prof.garage_invited_at) {
    const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.vvmdetails.com').replace(/\/$/, '');
    let sent = { sent: false, reason: 'no link' };
    try {
      const link = await admin.auth.admin.generateLink({ type: 'recovery', email: prof.email, options: { redirectTo: `${site}/reset-password` } });
      const url = link.data?.properties?.action_link;
      if (url) {
        const first = String(prof.display_name || '').trim().split(/\s+/)[0] || 'there';
        sent = await customerMail.sendCustomerEmail({ to: prof.email, name: prof.display_name, subject: 'Your VVM Details Garage is ready', text: [
          `Hi ${first},`, '', 'Your VVM Details Garage is ready! See your photos, your vehicle health and your maintenance membership in one place.', '',
          `1) Choose your password: ${url}`, `2) Then sign in: ${site}/client-login`, '',
          'If the link has expired, tap "Forgot password" on the sign-in page and we will send a new one.', '',
          'Questions? Text (240) 601-9451 or reply to this email.', '', 'VVM Details',
        ].join('\n') });
      }
    } catch (e) { sent = { sent: false, reason: 'email error' }; }
    if (sent.sent) { patch.garage_invited_at = new Date().toISOString(); note = ' They were emailed a link to choose a password.'; }
    else note = ` No email was sent (${sent.reason}). Use "Set password" under Clients and share it privately.`;
  }
  const { error: uErr } = await admin.from('garage_profiles').update(patch).eq('user_id', customerId);
  if (uErr) return { ok: false, status: 503, message: 'Could not change the Garage. Run the "auto garage" update in Supabase first.' };
  return { ok: true, message: enabled === true ? `Garage is ON.${note}` : 'Garage is OFF. The client cannot open it.' };
}

module.exports = { parseVehicle, sizeFrom, servicesByVehicle, createFromBooking, recordCompleted, setEnabled };
