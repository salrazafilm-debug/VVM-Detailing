const { json, httpError } = require('../square');
const { sendBookingEmail } = require('../mail');

const clean = (s, max) => String(s || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

// Book My Day: emails the owner exactly what the client typed and the day and time they chose.
// Nothing else: no prices, no Square reads, no time check, no holds.
async function emailRequest(b) {
  const name = clean(b.name, 80), email = clean(b.email, 120), notes = clean(b.notes, 1000);
  const digits = String(b.phone || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  if (name.length < 2) throw httpError(400, 'Please enter your name.');
  if (digits && digits.length !== 10) throw httpError(400, 'Please enter a 10-digit phone number.');
  const location = clean(b.location, 200);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw httpError(400, 'Please enter a valid email.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '') || !/^\d{2}:\d{2}$/.test(b.time || '')) throw httpError(400, 'Please choose a day and time.');
  const vehicles = (Array.isArray(b.vehicles) ? b.vehicles : []).map(v => clean(v, 120)).filter(Boolean);
  const two = vehicles.length > 1;
  const services = clean(b.summary, 1500) || 'Not listed';
  try {
    await sendBookingEmail({
      subject: `New booking request: ${b.date} ${b.time} - ${name}`,
      replyTo: email,
      lines: [
        `Name: ${name}`, `Phone: ${digits ? b.phone : 'Not on file'}`, `Email: ${email}`, `Location: ${location || 'Not given'}`,
        `Day: ${b.date}`, `Time: ${b.time}`,
        `Vehicle${two ? 's' : ''}: ${two ? vehicles.map((v, i) => `${i + 1}) ${v}`).join(' | ') : vehicles[0] || 'Not given'}`,
        `Services: ${services}`,
        ...(clean(b.coupon, 40) ? [`Code / membership: ${clean(b.coupon, 40)}`] : []),
        `Notes: ${notes || 'None'}`,
      ],
    });
  } catch (e) {
    console.error('booking email failed:', e.message);
    throw httpError(e.status || 502, e.status === 503 ? e.message : 'We could not send your request. Please call or text us to book.');
  }
  return json(200, { ok: true, when: `${b.date} ${b.time}`, service: services, mode: 'request' });
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') throw httpError(405, 'Use POST.');
    const b = JSON.parse(event.body || '{}');
    if (b.website) return json(200, { ok: true }); // honeypot: bots fill this in
    return await emailRequest(b);
  } catch (e) {
    return json(e.status && e.status < 500 ? e.status : 502, { error: e.status && e.status < 500 ? e.message : 'We could not send your request. Please call or text us to book.' });
  }
};
