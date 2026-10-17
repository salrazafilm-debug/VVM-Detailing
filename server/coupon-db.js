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

function store() {
  return {
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

module.exports = { store, findCoupon, toCoupon };
