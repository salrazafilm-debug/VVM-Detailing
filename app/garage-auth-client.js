'use client';
import { createClient } from '@supabase/supabase-js';

let client;
export function supabaseBrowser() {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Client login is not configured yet.');
    client = createClient(url, key);
  }
  return client;
}

export async function garageRequest(path, options = {}) {
  const { data } = await supabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Please sign in to continue.');
  const response = await fetch(path, { ...options, headers: { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), Authorization: `Bearer ${token}`, ...options.headers } });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Request could not be completed.');
  return result;
}

export async function signOut() {
  if (client) await client.auth.signOut();
  location.assign('/client-login');
}
