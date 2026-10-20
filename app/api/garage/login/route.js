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
    const password = String(body.password || '');
    const action = body.action === 'reset' ? 'reset' : 'login';
    if (!password || password.length > 200) return Response.json({error:'Enter your password.'},{status:400});
    const { admin, auth } = clients();
    const { data: profiles, error: lookupError } = await admin.from('garage_profiles').select('email');
    if (lookupError || !profiles?.length) return Response.json({error:'Could not open the Garage right now.'},{status:503});
    let email = null, session = null;
    if (action === 'login') {
      for (const profile of profiles) {
        if (!profile.email) continue;
        const result = await auth.auth.signInWithPassword({email:profile.email, password});
        if (result.data?.session) { if (session) return Response.json({error:'This password is shared by more than one Garage. Please ask Admin to change one.'},{status:409}); session=result.data.session; email=profile.email; }
      }
      if (!session) return Response.json({error:'That password is not correct.'},{status:401});
    }
    if (action === 'reset') return Response.json({error:'Use the password provided by VVM Details to sign in.'},{status:400});
    return Response.json({session});
  } catch (error) {
    console.error('Garage name login:', error.message);
    return Response.json({error:'Could not sign in right now. Please try again.'},{status:500});
  }
}
