// Referral partners: people who are NOT clients (no Garage). The owner adds them in admin with a name and a custom
// code. Each friend who books with the code and is marked completed counts as one. Every 5th completed referral
// earns a free detail: the owner books it, then taps "Used" in admin, which takes it off the free detail count.
const GOAL = 5;
const normalize = s => String(s || '').replace(/\s+/g, '').toUpperCase();

async function codeTaken(db, code, exceptPartnerId = null) {
  const [a, b, c, d, e] = await Promise.all([
    db.from('discount_codes').select('code').eq('code', code).maybeSingle(),
    db.from('coupons').select('code').eq('code', code).maybeSingle(),
    db.from('garage_offers').select('id').eq('coupon_code', code).maybeSingle(),
    db.from('garage_profiles').select('user_id').eq('referral_code', code).maybeSingle(),
    db.from('referral_partners').select('id').eq('code', code).neq('id', exceptPartnerId || '00000000-0000-0000-0000-000000000000').maybeSingle(),
  ]);
  return !!(a.data || b.data || c.data || d.data || e.data);
}

async function create(db, { name, code }) {
  const n = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const c = normalize(code);
  if (n.length < 2) throw Object.assign(new Error('Type the person\'s name.'), { status: 400 });
  if (!/^[A-Z0-9]{4,12}$/.test(c)) throw Object.assign(new Error('Use 4 to 12 letters or numbers for the code, with no spaces or symbols.'), { status: 400 });
  if (await codeTaken(db, c)) throw Object.assign(new Error(`The code ${c} is already in use. Try another.`), { status: 409 });
  const { data, error } = await db.from('referral_partners').insert({ name: n, code: c }).select('*').single();
  if (error) throw Object.assign(new Error('Could not save. Run the referral partners update in Supabase first.'), { status: 503 });
  return data;
}

async function findPartner(db, code) {
  const key = normalize(code);
  if (!key) return null;
  const { data, error } = await db.from('referral_partners').select('*').eq('code', key).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { partnerId: data.id, name: data.name, code: data.code, email: '' } : null;
}

// Progress for one partner: completed friends, the 0-to-5 tracker, and free details earned but not yet used.
function progressOf(partner, completed) {
  const earnedTotal = Math.floor(completed / GOAL);
  return { completed, progress: completed % GOAL, goal: GOAL, earned: Math.max(0, earnedTotal - (partner.redeemed || 0)) };
}

async function list(db) {
  const { data: partners, error } = await db.from('referral_partners').select('*').order('created_at', { ascending: false });
  if (error) return [];
  const { data: rows } = await db.from('partner_referrals').select('partner_id,status');
  return (partners || []).map(p => {
    const mine = (rows || []).filter(r => r.partner_id === p.id);
    const completed = mine.filter(r => r.status === 'completed').length;
    const pending = mine.filter(r => r.status === 'pending').length;
    return { id: p.id, name: p.name, code: p.code, pending, ...progressOf(p, completed) };
  });
}

// A booking with this partner's code: waits until the owner marks it completed.
async function recordReferral(db, { partnerId, name, email, bookingId }) {
  const { error } = await db.from('partner_referrals').insert({ partner_id: partnerId, referee_name: name || null, referee_email: String(email).trim().toLowerCase(), booking_id: bookingId || null, status: 'pending' });
  if (error) throw new Error(error.message);
  return null;
}

// Owner marked the booking completed: count it (once). Returns the new progress, or null if this booking had no partner.
async function completeForBooking(db, bookingId) {
  const { data: row } = await db.from('partner_referrals').select('id,partner_id,status').eq('booking_id', bookingId).eq('status', 'pending').maybeSingle();
  if (!row) return null;
  await db.from('partner_referrals').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', row.id);
  const { data: partner } = await db.from('referral_partners').select('*').eq('id', row.partner_id).single();
  const { count } = await db.from('partner_referrals').select('id', { count: 'exact', head: true }).eq('partner_id', row.partner_id).eq('status', 'completed');
  return { name: partner.name, ...progressOf(partner, count || 0) };
}

// Owner used one free detail for this partner.
async function redeem(db, partnerId) {
  const { data: p } = await db.from('referral_partners').select('*').eq('id', partnerId).maybeSingle();
  if (!p) throw Object.assign(new Error('Partner not found.'), { status: 404 });
  const { count } = await db.from('partner_referrals').select('id', { count: 'exact', head: true }).eq('partner_id', partnerId).eq('status', 'completed');
  if (Math.floor((count || 0) / GOAL) - (p.redeemed || 0) < 1) throw Object.assign(new Error('No free detail is waiting for this person yet.'), { status: 400 });
  const { error } = await db.from('referral_partners').update({ redeemed: (p.redeemed || 0) + 1 }).eq('id', partnerId);
  if (error) throw new Error(error.message);
  return true;
}

// Same email may not be used twice (new clients only), same as client referrals.
async function emailUsed(db, email) {
  const { data } = await db.from('partner_referrals').select('id').ilike('referee_email', email).neq('status', 'dismissed').limit(1);
  return !!(data && data.length);
}

module.exports = { GOAL, codeTaken, create, findPartner, list, progressOf, recordReferral, completeForBooking, redeem, emailUsed };
