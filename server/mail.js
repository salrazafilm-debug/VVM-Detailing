// Booking requests are emailed to the owner with Resend. No Resend key = the request fails loudly
// (the customer is told to call or text) instead of silently disappearing.
const BOOKING_TO = process.env.BOOKING_TO || 'vvm.detailing@gmail.com';
const BOOKING_FROM = process.env.BOOKING_FROM || 'VVM Details <onboarding@resend.dev>';

async function sendBookingEmail({ subject, lines, replyTo }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw Object.assign(new Error('Email is not set up yet.'), { status: 503 });
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: BOOKING_FROM, to: [BOOKING_TO], reply_to: replyTo, subject, text: lines.join('\n') }),
  });
  if (!r.ok) throw new Error('Resend ' + r.status);
}

module.exports = { sendBookingEmail };
