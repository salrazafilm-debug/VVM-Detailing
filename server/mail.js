// Booking requests are emailed to the owner with Resend. No Resend key = the request fails loudly
// (the customer is told to call or text) instead of silently disappearing.
const BOOKING_TO = process.env.BOOKING_TO || 'vvm.detailing@gmail.com';
const BOOKING_FROM = process.env.BOOKING_FROM || 'VVM Details <onboarding@resend.dev>';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Same look as the customer emails. Each "Label: value" line becomes a row; other lines are shown as notes.
function bookingAlertHtml(lines) {
  const rows = [], notes = [];
  for (const line of lines) {
    const m = line.match(/^([A-Za-z][A-Za-z /()-]{1,30}):\s*(.*)$/);
    if (m) rows.push([m[1], m[2]]); else notes.push(line);
  }
  const row = ([k, v]) => `<tr><td style="padding:10px 0;border-bottom:1px solid #f1e4e4;color:#7a6468;font-size:13px;width:120px;vertical-align:top">${esc(k)}</td><td style="padding:10px 0;border-bottom:1px solid #f1e4e4;color:#1a1214;font-size:15px;font-weight:600">${esc(v)}</td></tr>`;
  const note = t => `<p style="margin:0 0 10px;font-size:14px;line-height:1.5;color:#1a1214;background:#fff7d6;border-radius:10px;padding:10px 12px">${esc(t)}</p>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#e9b3b3;font-family:Manrope,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#e9b3b3;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden">
  <tr><td align="center" style="background:#1a1214;padding:28px 24px">
    <img src="https://www.vvmdetails.com/assets/logo.jpg" width="96" alt="VVM Details" style="display:block;margin:0 auto 14px;border-radius:12px;width:96px;height:auto;border:0">
    <div style="font-family:'Montserrat',Helvetica,Arial,sans-serif;font-style:italic;font-weight:900;font-size:26px;letter-spacing:.02em;color:#ffffff">NEW BOOKING REQUEST</div>
    <div style="height:4px;width:120px;margin:14px auto 0;background:linear-gradient(90deg,#4f8ff0,#f0d63c,#e4572e);border-radius:4px"></div>
  </td></tr>
  <tr><td style="padding:28px 28px 26px">
    ${notes.length ? `<div style="margin:0 0 18px">${notes.map(note).join('')}</div>` : ''}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fbf4f4;border-radius:12px;padding:6px 16px">${rows.map(row).join('')}</table>
    <p style="margin:18px 0 0;font-size:13px;color:#7a6468;line-height:1.5">Reply to this email to reach the customer directly.</p>
  </td></tr>
</table></td></tr></table></body></html>`;
}

async function sendBookingEmail({ subject, lines, replyTo }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw Object.assign(new Error('Email is not set up yet.'), { status: 503 });
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: BOOKING_FROM, to: [BOOKING_TO], reply_to: replyTo, subject, text: lines.join('\n'), html: bookingAlertHtml(lines) }),
  });
  if (!r.ok) throw new Error('Resend ' + r.status);
}

module.exports = { sendBookingEmail, bookingAlertHtml };
