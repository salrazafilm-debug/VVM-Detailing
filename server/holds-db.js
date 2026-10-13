// Supabase storage for holds. Uses the SECRET key, server side only (never NEXT_PUBLIC_*).
const { createClient } = require('@supabase/supabase-js');

function store() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Supabase is not configured (SUPABASE_URL, SUPABASE_SECRET_KEY).');
  const db = createClient(url, key, { auth: { persistSession: false } }).from('holds');
  return {
    async list(month) {
      const { data, error } = await db.select('key,date,start,end,kind,expires').like('date', month + '%');
      if (error) throw new Error(error.message);
      return data;
    },
    async insert(row) {
      const { error } = await db.insert(row);
      if (error) throw new Error(error.message);
    },
    async remove(keys) {
      const { error } = await db.delete().in('key', keys);
      if (error) throw new Error(error.message);
    },
  };
}

module.exports = { store };
