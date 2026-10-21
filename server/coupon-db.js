// Coupons live in the Supabase `coupons` table (add a row, no code change, no redeploy). Their use counts live in
// `coupon_uses`. Both are read and written with the SECRET key, server side only, so codes and details never reach the browser.
const { createClient } = require('@supabase/supabase-js');

function client() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Supabase is not configured (SUPABASE_URL, SUPABASE_SECRET_KEY).');
  return createClient(url, key, { auth: { persistSession: false } });
}

// One database row -> the shape the booking code uses
function toCoupon(row) {
  return {
    code: row.code,
    item: row.item,
    label: row.label,
    priceCents: row.price_cents,
    savingCents: row.saving_cents,
    uses: row.uses_limit,
    customer: row.customer_name || '',
    vehicle: row.vehicle || '',
    phone: row.phone || '',
    email: row.email || '',
    address: row.address || '',
  };
}

// Finds an active coupon by its code (not case sensitive, spaces ignored). Returns null if there is none.
async function findCoupon(code) {
  const key = String(code || '').replace(/\s+/g, '').toUpperCase();
  if (!key) return null;
  const { data, error } = await client().from('coupons').select('*').eq('code', key).eq('active', true).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toCoupon(data) : null;
}

// Membership offers: one Full Factory Reset at half off per membership cycle. Lives in garage_offers.
const SIZE_WORDS = { coupe: /^coupe/i, sedan: /^sedan/i, suv: /^suv/i, truck: /^truck/i, minivan: /^mini-?\s?van/i };
function sizeMatches(label, size) { return !!SIZE_WORDS[size] && SIZE_WORDS[size].test(String(label || '')); }

function store() {
  return {
    async garageOffer(code) {
      const key = String(code || '').replace(/\s+/g, '').toUpperCase();
      if (!key) return null;
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      const { data: offer, error } = await client().from('garage_offers')
        .select('id,coupon_code,status,vehicle_id,garage_vehicles!inner(id,year,make,model,vehicle_size,customer_id)')
        .eq('coupon_code', key).eq('status', 'available').lte('starts_on', today).gte('expires_at', today).maybeSingle();
      if (error) throw new Error(error.message);
      if (!offer) return null;
      const { data: profile } = await client().from('garage_profiles').select('email,display_name').eq('user_id', offer.garage_vehicles.customer_id).maybeSingle();
      const v = offer.garage_vehicles;
      return { id: offer.id, coupon_code: offer.coupon_code, email: profile?.email || '', name: profile?.display_name || '', size: v.vehicle_size || null, vehicle: { year: v.year, make: v.make, model: v.model } };
    },
    // Reserve the offer while the booking is checked; released if the booking fails, redeemed once it is sent.
    async claimGarageOffer(code, email) {
      const { data, error } = await client().from('garage_offers').update({ status: 'reserved' }).eq('coupon_code', code).eq('status', 'available').select('id').maybeSingle();
      if (error) throw new Error(error.message);
      return data?.id || null;
    },
    async releaseGarageOffer(id) {
      const { error } = await client().from('garage_offers').update({ status: 'available' }).eq('id', id).eq('status', 'reserved');
      if (error) throw new Error(error.message);
    },
    async redeemGarageOffer(id) {
      const { error } = await client().from('garage_offers').update({ status: 'redeemed' }).eq('id', id);
      if (error) throw new Error(error.message);
    },
    async count(code) {
      const { count, error } = await client().from('coupon_uses').select('code', { count: 'exact', head: true }).eq('code', code);
      if (error) throw new Error(error.message);
      return count || 0;
    },
    async add(code) {
      const { error } = await client().from('coupon_uses').insert({ code });
      if (error) throw new Error(error.message);
    },
  };
}

module.exports = { sizeMatches, store, findCoupon, toCoupon };
