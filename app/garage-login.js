'use client';
import { useState } from 'react';
import { supabaseBrowser } from './garage-auth-client';
import GarageIcon from './garage-icons';
import './garage-login.css';

function LoginIcon({ name }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {name === 'email' ? <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m3 6 9 7 9-7M3 19l6-7m12 7-6-7"/></> : name === 'lock' ? <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/><path stroke="#ffdc46" d="M12 15v3"/></> : name === 'services' ? <path d="M21 3a6 6 0 0 1-7.5 7.5L5 19a2.1 2.1 0 0 1-3-3l8.5-8.5A6 6 0 0 1 18 0l-4 4 2 4 4-1Z" transform="translate(1 2) scale(.9)"/> : name === 'history' ? <><path d="M6 2h9l5 5v15H6Z"/><path d="M15 2v6h5M9 12h8M9 16h8M9 19h5"/></> : <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{name === 'hidden' && <path d="m3 21 18-18"/>}</>}
  </svg>;
}

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
  return <main className="virtual-login">
    <picture className="virtual-login-scene" aria-hidden="true">
      <source media="(max-width: 700px)" srcSet="/assets/garage/login-mobile.webp"/>
      <img src="/assets/garage/login-desktop.webp" alt="" width="1672" height="941" fetchPriority="high"/>
    </picture>
    <a className="virtual-login-home" href="/" aria-label="VVM Details — back to website"><span aria-hidden="true">←</span> Back to website</a>
    <section className="virtual-login-panel" aria-labelledby="signin-title">
      <h1 id="signin-title" className={reset || admin ? 'virtual-login-title' : 'virtual-login-sr'}>{reset ? 'Reset password' : admin ? 'Admin sign in' : 'Sign in to your VVM Virtual Garage'}</h1>
      {reset && <p className="virtual-login-description">Enter your email for a secure reset link.</p>}
      <form className="virtual-login-form" onSubmit={submit} aria-busy={busy}>
        <label className="virtual-login-sr" htmlFor="signin-email">Email address</label>
        <div className="virtual-login-field"><LoginIcon name="email"/><input id="signin-email" name="email" required type="email" autoComplete="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} disabled={busy}/></div>
        {!reset && <><label className="virtual-login-sr" htmlFor="signin-password">Password</label><div className="virtual-login-field"><LoginIcon name="lock"/><input id="signin-password" name="password" required type={showPassword?'text':'password'} autoComplete="current-password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} disabled={busy}/><button className="virtual-login-eye" type="button" aria-label={showPassword?'Hide password':'Show password'} aria-pressed={showPassword} onClick={()=>setShowPassword(v=>!v)} disabled={busy}><LoginIcon name={showPassword?'visible':'hidden'}/></button></div></>}
        {message && <p className="virtual-login-message" role="status">{message}</p>}
        <button className="virtual-login-submit" type="submit" disabled={busy}>{busy ? 'Please wait…' : reset ? 'Send reset link' : 'Sign In'}<span aria-hidden="true">→</span></button>
      </form>
      <div className="virtual-login-divider"><span>{admin ? 'MANAGE YOUR GARAGE' : 'ENTER YOUR GARAGE'}</span></div>
      <ul className="virtual-login-features" aria-label="Inside your garage">
        <li><GarageIcon name="garage"/><span>Vehicles</span></li>
        <li><LoginIcon name="services"/><span>Services</span></li>
        <li><GarageIcon name="bookings"/><span>Appointments</span></li>
        <li><LoginIcon name="history"/><span>History</span></li>
      </ul>
      <div className="virtual-login-support">{reset ? <button type="button" disabled={busy} onClick={()=>{setReset(false);setMessage('')}}>← Back to sign in</button> : <button type="button" disabled={busy} onClick={()=>{setReset(true);setMessage('');setPassword('');setShowPassword(false)}}>Forgot password?</button>}{!admin && <a href="mailto:vvm.detailing@gmail.com">Need help?</a>}</div>
    </section>
  </main>;
}
