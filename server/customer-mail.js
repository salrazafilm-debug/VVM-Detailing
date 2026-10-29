// Emails to CUSTOMERS (confirmation and the day-before reminder). Sent with Brevo, the same account the Garage
// reminders use. Needs BREVO_API_KEY and a verified sender (BREVO_SENDER_EMAIL, default vvm.detailing@gmail.com).
// Without a key nothing is sent and the caller is told, so admin can say so instead of failing silently.
const { HOME } = require('./travel');

const fmtTime = t => { const [h, m] = String(t || '').split(':').map(Number); if (!Number.isFinite(h)) return t || ''; return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
const fmtDate = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' });
const firstName = n => String(n || '').trim().split(/\s+/)[0] || 'there';
const easternToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const tomorrowEastern = () => { const [y, m, d] = easternToday().split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10); };

async function sendCustomerEmail({ to, name, subject, text }) {
  const key = process.env.BREVO_API_KEY;
  if (!key) return { sent: false, reason: 'BREVO_API_KEY is not set' };
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST', signal: AbortSignal.timeout(20000),
    headers: { 'api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ sender: { name: 'VVM Details', email: process.env.BREVO_SENDER_EMAIL || 'vvm.detailing@gmail.com' }, to: [{ email: to, name: name || undefined }], replyTo: { email: 'vvm.detailing@gmail.com' }, subject, textContent: text }),
  });
  return r.ok ? { sent: true } : { sent: false, reason: `Brevo said ${r.status}` };
}

function bookingBody(b, intro) {
  return [
    `Hi ${firstName(b.name)},`, '', intro, '',
    `Day: ${fmtDate(b.booking_date)} at ${fmtTime(b.booking_time)}`,
    `Vehicle: ${b.vehicles || 'on file'}`,
    `Services: ${b.services || 'on file'}`,
    ...(b.drop_off ? ['', `Drop-off location: ${HOME.street}, ${HOME.city}, ${HOME.state} ${HOME.zip}`] : []),
    '', 'Need to change anything? Text (240) 601-9451 or just reply to this email.', '', 'See you soon!', 'VVM Details',
  ].join('\n');
}

const sendConfirmation = b => sendCustomerEmail({ to: b.email, name: b.name, subject: 'Your VVM Details booking is confirmed', text: bookingBody(b, 'Good news: your booking is confirmed.') });

// Run once a day by the cron. Confirmed bookings happening tomorrow get one reminder.
async function sendBookingReminders(db) {
  const day = tomorrowEastern();
  const { data: rows, error } = await db.from('booking_requests').select('*').eq('booking_date', day).eq('status', 'confirmed').is('reminder_sent_at', null).limit(50);
  if (error) return { error: 'Could not read bookings.' };
  let sent = 0; const skipped = [];
  for (const b of rows || []) {
    const r = await sendCustomerEmail({ to: b.email, name: b.name, subject: 'Reminder: your VVM Details booking is tomorrow', text: bookingBody(b, 'A friendly reminder: your detail is tomorrow.') });
    if (r.sent) { sent++; await db.from('booking_requests').update({ reminder_sent_at: new Date().toISOString() }).eq('id', b.id); }
    else skipped.push(r.reason);
  }
  return { day, due: (rows || []).length, sent, ...(skipped.length ? { skipped: [...new Set(skipped)] } : {}) };
}

module.exports = { sendCustomerEmail, sendConfirmation, sendBookingReminders, fmtTime, fmtDate, tomorrowEastern };
