// Emails to CUSTOMERS (confirmation and the day-before reminder). Sent with Brevo, the same account the Garage
// reminders use. Needs BREVO_API_KEY and a verified sender (BREVO_SENDER_EMAIL, default vvm.detailing@gmail.com).
// Without a key nothing is sent and the caller is told, so admin can say so instead of failing silently.
const { HOME } = require('./travel');

const fmtTime = t => { const [h, m] = String(t || '').split(':').map(Number); if (!Number.isFinite(h)) return t || ''; return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
const fmtDate = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' });
const firstName = n => String(n || '').trim().split(/\s+/)[0] || 'there';
const easternToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const tomorrowEastern = () => { const [y, m, d] = easternToday().split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10); };

async function sendCustomerEmail({ to, name, subject, text, html }) {
  const key = process.env.BREVO_API_KEY;
  if (!key) return { sent: false, reason: 'BREVO_API_KEY is not set' };
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST', signal: AbortSignal.timeout(20000),
    headers: { 'api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ sender: { name: 'VVM Details', email: process.env.BREVO_SENDER_EMAIL || 'vvm.detailing@gmail.com' }, to: [{ email: to, name: name || undefined }], replyTo: { email: 'vvm.detailing@gmail.com' }, subject, textContent: text, ...(html ? { htmlContent: html } : {}) }),
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
    '', 'WHAT TO HAVE READY',
    '- Empty your vehicle: please remove all personal belongings and any items from your vehicle so we can complete the detail.',
    ...(b.drop_off ? ['- Bring it at your booked time to the drop-off location above.'] : ['- Leave room to work: park where we can open the doors and work all the way around it.', '- Water and power: let us know if you have access. We will confirm anything else when we reach out.']),
    '', 'Need to change anything? Text (240) 601-9451 or just reply to this email.', '', 'See you soon!', 'VVM Details',
  ].join('\n');
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SITE = 'https://www.vvmdetails.com';

// Branded HTML version of the same booking text (table layout, inline styles, works in Gmail and Outlook).
function bookingHtml(b, intro, heading) {
  const row = (label, value) => `<tr><td style="padding:10px 0;border-bottom:1px solid #f1e4e4;color:#7a6468;font-size:13px;width:110px;vertical-align:top">${esc(label)}</td><td style="padding:10px 0;border-bottom:1px solid #f1e4e4;color:#1a1214;font-size:15px;font-weight:600">${esc(value)}</td></tr>`;
  const bullet = t => `<tr><td style="padding:6px 0;color:#1a1214;font-size:15px;line-height:1.5"><span style="color:#4f8ff0;font-weight:800">&#10003;</span>&nbsp; ${esc(t)}</td></tr>`;
  const ready = b.drop_off
    ? ['Empty your vehicle: remove personal belongings and loose items.', 'Bring it at your booked time to the drop-off location.']
    : ['Empty your vehicle: remove personal belongings and loose items.', 'Leave room to work: park where we can open the doors and work all the way around.', 'Water and power: let us know if you have access. We will confirm anything else when we reach out.'];
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#e9b3b3;font-family:Manrope,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#e9b3b3;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden">
  <tr><td align="center" style="background:#1a1214;padding:28px 24px">
    <img src="${SITE}/assets/logo.jpg" width="96" alt="VVM Details" style="display:block;margin:0 auto 14px;border-radius:12px;width:96px;height:auto;border:0">
    <div style="font-family:'Montserrat',Helvetica,Arial,sans-serif;font-style:italic;font-weight:900;font-size:26px;letter-spacing:.02em;color:#ffffff">${esc(heading)}</div>
    <div style="height:4px;width:120px;margin:14px auto 0;background:linear-gradient(90deg,#4f8ff0,#f0d63c,#e4572e);border-radius:4px"></div>
  </td></tr>
  <tr><td style="padding:28px 28px 8px">
    <p style="margin:0 0 6px;font-size:17px;color:#1a1214;font-weight:700">Hi ${esc(firstName(b.name))},</p>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#1a1214">${esc(intro)}</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fbf4f4;border-radius:12px;padding:6px 16px">
      ${row('When', `${fmtDate(b.booking_date)} at ${fmtTime(b.booking_time)}`)}
      ${row('Vehicle', b.vehicles || 'On file')}
      ${row('Services', b.services || 'On file')}
      ${b.drop_off ? row('Drop-off', `${HOME.street}, ${HOME.city}, ${HOME.state} ${HOME.zip}`) : ''}
    </table>
  </td></tr>
  <tr><td style="padding:22px 28px 8px">
    <p style="margin:0 0 8px;font-family:'Montserrat',Helvetica,Arial,sans-serif;font-style:italic;font-weight:900;font-size:15px;letter-spacing:.06em;color:#1a1214">WHAT TO HAVE READY</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${ready.map(bullet).join('')}</table>
  </td></tr>
  <tr><td align="center" style="padding:22px 28px 10px">
    <a href="tel:+12406019451" style="display:inline-block;background:#1a1214;color:#ffffff;text-decoration:none;font-weight:800;font-size:14px;letter-spacing:.06em;padding:14px 26px;border-radius:999px">CALL OR TEXT (240) 601-9451</a>
    <p style="margin:14px 0 0;font-size:14px;color:#7a6468;line-height:1.5">Need to change anything? Just reply to this email.</p>
  </td></tr>
  <tr><td align="center" style="padding:18px 28px 26px;border-top:1px solid #f1e4e4">
    <p style="margin:0;font-family:'Montserrat',Helvetica,Arial,sans-serif;font-style:italic;font-weight:900;font-size:16px;color:#1a1214">See you soon!</p>
    <p style="margin:6px 0 0;font-size:12px;color:#7a6468">VVM Details &middot; Mobile car detailing &middot; Chesapeake Beach, MD</p>
    <p style="margin:6px 0 0;font-size:12px"><a href="${SITE}" style="color:#4f8ff0;text-decoration:none">vvmdetails.com</a> &middot; <a href="https://www.instagram.com/vvm.details" style="color:#4f8ff0;text-decoration:none">@vvm.details</a></p>
  </td></tr>
</table></td></tr></table></body></html>`;
}

const sendConfirmation = b => sendCustomerEmail({ to: b.email, name: b.name, subject: 'Your VVM Details booking is confirmed', text: bookingBody(b, 'Good news: your booking is confirmed.'), html: bookingHtml(b, 'Good news: your booking is confirmed. We cannot wait to make your car shine.', 'BOOKING CONFIRMED') });

// Run once a day by the cron. Confirmed bookings happening tomorrow get one reminder.
async function sendBookingReminders(db) {
  const day = tomorrowEastern();
  const { data: rows, error } = await db.from('booking_requests').select('*').eq('booking_date', day).eq('status', 'confirmed').is('reminder_sent_at', null).limit(50);
  if (error) return { error: 'Could not read bookings.' };
  let sent = 0; const skipped = [];
  for (const b of rows || []) {
    const r = await sendCustomerEmail({ to: b.email, name: b.name, subject: 'Reminder: your VVM Details booking is tomorrow', text: bookingBody(b, 'A friendly reminder: your detail is tomorrow.'), html: bookingHtml(b, 'A friendly reminder: your detail is tomorrow. See you soon!', 'SEE YOU TOMORROW') });
    if (r.sent) { sent++; await db.from('booking_requests').update({ reminder_sent_at: new Date().toISOString() }).eq('id', b.id); }
    else skipped.push(r.reason);
  }
  return { day, due: (rows || []).length, sent, ...(skipped.length ? { skipped: [...new Set(skipped)] } : {}) };
}

module.exports = { sendCustomerEmail, sendConfirmation, sendBookingReminders, bookingHtml, fmtTime, fmtDate, tomorrowEastern };
