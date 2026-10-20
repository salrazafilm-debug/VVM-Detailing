'use client';
import { useState } from 'react';
import { supabaseBrowser } from './garage-auth-client';

export default function GarageLogin({ admin = false }) {
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [reset, setReset] = useState(false);
  const [showPassword,setShowPassword] = useState(false);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setMessage('');
    try {
      const sb = supabaseBrowser();
      if (reset) {
        const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/reset-password` });
        if (error) throw error;
        setMessage('Check your email for a secure password reset link.');
      } else {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        location.assign(admin ? '/garage-admin' : '/garage');
      }
    } catch (err) { setMessage(err.message || 'Could not sign in.'); }
    finally { setBusy(false); }
  }
  return <main className="garage-shell vvm-signin">
    <header className="signin-header"><a className="garage-brand" href="/"><img src="/assets/logo.jpg" alt=""/> VVM DETAILS</a><a className="signin-back" href="/">Back to website <span aria-hidden="true">→</span></a></header>
    <div className="signin-body"><aside className="signin-story" aria-label="Welcome to your VVM Garage">
      <p className="signin-story-kicker"><span aria-hidden="true">✦</span> A LITTLE LOVE. EVERY DETAIL.</p>
      <h2>Your car.<br/>{' '}Your care.<br/>{' '}<span>Your Garage.</span></h2>
      <p className="signin-story-copy">That fresh-detail feeling.<br/>All in one happy place.</p>
      <div className="signin-photo-strip" aria-hidden="true"><img src="/assets/white-lexus-is-front.jpg" alt=""/><img src="/assets/red-black-mercedes-amg-interior.jpg" alt=""/></div>
      <div className="signin-perks"><span>PHOTOS</span><i aria-hidden="true">✦</i><span>PROTECTION</span><i aria-hidden="true">✦</i><span>YOUR HISTORY</span></div>
    </aside><div className="signin-card-wrap"><section className="signin-panel" aria-labelledby="signin-title">
      <div className="signin-accent" aria-hidden="true"><i/><i/><i/></div>
      <div className="signin-intro"><span className="signin-kicker">{admin?'VVM ADMIN':'THE VVM FAMILY'}</span><h1 id="signin-title">{reset?'Reset password.':admin?'Let’s get to work.':'Welcome back.'}</h1><p>{reset?'Enter your email and we’ll send a reset link.':admin?'Sign in to manage your clients and their vehicles.':'Your car care deserves its own space. Enter yours.'}</p></div>
      <form className="signin-form" onSubmit={submit} aria-busy={busy}>
        <label htmlFor="signin-email">Email address</label><input id="signin-email" required type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} disabled={busy}/>
        {!reset&&<><div className="signin-label-row"><label htmlFor="signin-password">Password</label><button type="button" disabled={busy} onClick={()=>{setReset(true);setMessage('');setPassword('')}}>Forgot password?</button></div><div className="signin-password"><input id="signin-password" required type={showPassword?'text':'password'} autoComplete="current-password" placeholder="Enter your password" value={password} onChange={e=>setPassword(e.target.value)} disabled={busy}/><button type="button" aria-label={showPassword?'Hide password':'Show password'} aria-pressed={showPassword} onClick={()=>setShowPassword(v=>!v)} disabled={busy}>{showPassword?'HIDE':'SHOW'}</button></div></>}
        {message&&<p className="signin-message" role="status">{message}</p>}
        <button className="signin-submit" disabled={busy}>{busy?'PLEASE WAIT…':reset?'SEND RESET LINK':'ENTER'}<span aria-hidden="true">→</span></button>
      </form>
      {reset?<button className="signin-return" disabled={busy} onClick={()=>{setReset(false);setMessage('')}}>← Back to sign in</button>:!admin&&<p className="signin-help">Need your login? <a href="mailto:vvm.detailing@gmail.com">Contact the VVM team</a></p>}
    </section><footer className="signin-footer">GOOD CARS. BRIGHTER DAYS.</footer></div></div>
  </main>;
}
