// The message the owner copies to a client after a booking request (Admin > Bookings > Needs your OK).
// Default: the standard confirmation. "Change" adds what the owner types, right after the greeting.
const ORDINAL = n => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// "2026-11-20" -> "November 20th"
function longDate(ymd) {
  const [y, m, d] = String(ymd || '').split('-').map(Number);
  if (!y || !m || !d) return String(ymd || '');
  return `${MONTHS[m - 1]} ${ORDINAL(d)}`;
}

// "2022 Honda Civic | 2019 Ford F-150" -> "2022 Honda Civic and 2019 Ford F-150"
function carText(vehicles) {
  const parts = String(vehicles || '').split(' | ').map(s => s.trim()).filter(Boolean);
  if (!parts.length) return 'vehicle';
  return parts.length === 1 ? parts[0] : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
}

function firstName(name) { return String(name || '').trim().split(/\s+/)[0] || 'there'; }

function confirmMessage(booking, { sender = 'Bruce', extra = '' } = {}) {
  const lines = [
    `Hi ${firstName(booking.name)}! How are you? This is ${sender} with VVM Details`,
    '',
    'Messaging to confirm our appt.',
    `for your ${carText(booking.vehicles)} on ${longDate(booking.booking_date)}!`,
  ];
  const note = String(extra || '').trim();
  if (note) lines.push('', note);
  lines.push(
    '',
    'If you have any questions,',
    'you can let me know here directly - all good on my end and reserved the booking!',
    '',
    'Thank you!',
    '',
    '🚘',
  );
  return lines.join('\n');
}

module.exports = { confirmMessage, longDate, carText, ORDINAL };
