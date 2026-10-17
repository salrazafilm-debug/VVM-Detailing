const { createClient } = require('@supabase/supabase-js');

function config() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !anon || !secret) throw Object.assign(new Error('Garage authentication is not configured.'), { status: 503 });
  return { url, anon, secret };
}

function bearer(req) {
  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw Object.assign(new Error('Please sign in.'), { status: 401 });
  return match[1];
}

async function customerContext(req) {
  const { url, anon, secret } = config();
  const token = bearer(req);
  const auth = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user }, error } = await auth.auth.getUser(token);
  if (error || !user) throw Object.assign(new Error('Your session expired. Please sign in again.'), { status: 401 });
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  return { user, token, db: auth, admin };
}

async function requireAdmin(ctx) {
  const { data, error } = await ctx.admin.from('garage_admins').select('user_id').eq('user_id', ctx.user.id).maybeSingle();
  if (error) throw Object.assign(new Error('Could not verify administrator access.'), { status: 503 });
  if (!data) throw Object.assign(new Error('Administrator access required.'), { status: 403 });
  return ctx;
}

function responseError(error) {
  const status = Number(error.status) || 500;
  return Response.json({ error: status >= 500 ? (status === 503 ? error.message : 'Something went wrong. Please try again.') : error.message }, { status });
}

module.exports = { customerContext, requireAdmin, responseError, bearer, config };
