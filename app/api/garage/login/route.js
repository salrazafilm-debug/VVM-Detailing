import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function clients() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !anon || !secret) throw new Error('Garage authentication is not configured.');
  return { admin: createClient(url, secret, { auth:{persistSession:false} }), auth: createClient(url, anon, { auth:{persistSession:false} }) };
}

export async function POST(req) {
  try {
    const body = await req.json();
    const name = String(body.name || '').trim();
    const action = body.action === 'reset' ? 'reset' : 'login';
    if (!name || name.length > 120) return Response.json({error:'Enter your name.'},{status:400});
    const { admin, auth } = clients();
    const { data: profiles, error: lookupError } = await admin.from('garage_profiles').select('email').ilike('display_name', name);
    if (lookupError || !profiles?.length || profiles.length !== 1) return Response.json({error:'We could not match that name. Please contact VVM Details.'},{status:401});
    const email = profiles[0].email;
    if (action === 'reset') {
      const { error } = await auth.auth.resetPasswordForEmail(email, { redirectTo: String(body.redirectTo || '') });
      if (error) throw error;
      return Response.json({ok:true});
    }
    const password = String(body.password || '');
    if (!password) return Response.json({error:'Enter your password.'},{status:400});
    const { data, error } = await auth.auth.signInWithPassword({email, password});
    if (error || !data.session) return Response.json({error:'That name or password is not correct.'},{status:401});
    return Response.json({session:data.session});
  } catch (error) {
    console.error('Garage name login:', error.message);
    return Response.json({error:'Could not sign in right now. Please try again.'},{status:500});
  }
}
