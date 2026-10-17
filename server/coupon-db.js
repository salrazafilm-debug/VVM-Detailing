// Counts how many times each coupon has been used, in the Supabase `coupon_uses` table (see supabase/schema.sql).
// Uses the SECRET key, server side only.
const { createClient } = require('@supabase/supabase-js');

function store() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Supabase is not configured (SUPABASE_URL, SUPABASE_SECRET_KEY).');
  const businessDate = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const db = () => createClient(url, key, { auth: { persistSession: false } }).from('coupon_uses');
  return {
    async count(code) {
      const { count, error } = await db().select('code', { count: 'exact', head: true }).eq('code', code);
      if (error) throw new Error(error.message);
      return count || 0;
    },
    async add(code) {
      const { error } = await db().insert({ code });
      if (error) throw new Error(error.message);
    },
    async garageOffer(code) {
      const client = createClient(url, key, { auth: { persistSession: false } });
      const { data: offer, error } = await client.from('garage_offers').select('*').eq('coupon_code', String(code || '').toUpperCase()).eq('status', 'available').lte('starts_on', businessDate()).gte('expires_at', businessDate()).maybeSingle();
      if (error) throw new Error(error.message);
      if (!offer) return null;
      const [{ data: cycle }, { data: vehicle }] = await Promise.all([
        client.from('garage_maintenance_cycles').select('id').eq('id', offer.cycle_id).eq('status','active').maybeSingle(),
        client.from('garage_vehicles').select('id,year,make,model,customer_id').eq('id',offer.vehicle_id).maybeSingle(),
      ]);
      if (!cycle || !vehicle) return null;
      const { data: profile } = await client.from('garage_profiles').select('email').eq('user_id',vehicle.customer_id).single();
      return profile ? { ...offer, vehicle, email: profile.email } : null;
    },
    async claimGarageOffer(code, email) {
      const offer = await this.garageOffer(code);
      if (!offer || offer.email.toLowerCase() !== String(email || '').toLowerCase()) return null;
      const db = createClient(url, key, { auth: { persistSession: false } });
      const { data, error } = await db.from('garage_offers').update({ status: 'reserved' }).eq('id',offer.id).eq('status','available').lte('starts_on',businessDate()).gte('expires_at',businessDate()).select('id').maybeSingle();
      if (error) throw new Error(error.message);
      return data?.id || null;
    },
    async releaseGarageOffer(id) {
      const db = createClient(url, key, { auth: { persistSession: false } });
      const { error } = await db.from('garage_offers').update({ status: 'available' }).eq('id',id).eq('status','reserved');
      if (error) throw new Error(error.message);
    },
    async redeemGarageOffer(id) {
      const db = createClient(url, key, { auth: { persistSession: false } });
      const { error } = await db.from('garage_offers').update({ status: 'redeemed' }).eq('id',id).eq('status','reserved');
      if (error) throw new Error(error.message);
    },
  };
}

module.exports = { store };
