'use client';
import { useState } from 'react';
import { supabaseBrowser } from './garage-auth-client';

export default function GarageLogin() {
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [reset, setReset] = useState(false);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setMessage('');
    try {
      const sb = supabaseBrowser();
      if (reset) {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/reset-password` });
        if (error) throw error;
        setMessage('Check your email for a secure password reset link.');
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        location.assign('/garage');
      }
    } catch (err) { setMessage(err.message || 'Could not sign in.'); }
    finally { setBusy(false); }
  }
  return <main className="garage-shell login-shell"><a className="garage-brand" href="/"><img src="/assets/logo.jpg" alt=""/> VVM DETAILS</a><section className="login-card"><p className="g-eyebrow">YOUR PRIVATE DIGITAL GARAGE</p><h1>{reset ? 'Reset Password' : 'Client Login'}</h1><p className="g-muted">{reset ? 'We’ll send you a secure password reset link.' : 'Your car care, photos, and service history in one place.'}</p><form onSubmit={submit} className="g-form"><label>Email address<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>{!reset&&<label>Password<input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>}<button className="g-button" disabled={busy}>{busy?'PLEASE WAIT':reset?'SEND RESET LINK':'SIGN IN'}</button></form>{message&&<p className="g-message" role="status">{message}</p>}<button className="g-text-button" onClick={()=>{setReset(!reset);setMessage('')}}>{reset?'Back to sign in':'Forgot password?'}</button>{!reset&&<p className="g-join">No password yet? <a href="/#book">Book now</a> to join the family and gain access.</p>}<a className="g-back" href="/">← Back to VVM Details</a></section></main>;
}
