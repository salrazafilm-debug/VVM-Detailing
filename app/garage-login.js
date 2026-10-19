'use client';
import { useState } from 'react';
import { supabaseBrowser } from './garage-auth-client';

export default function GarageLogin({ admin = false }) {
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
        location.assign(admin ? '/garage-admin' : '/garage');
      }
    } catch (err) { setMessage(err.message || 'Could not sign in.'); }
    finally { setBusy(false); }
  }
  return <main className="garage-shell login-shell vvm-entry"><header className="entry-header"><a className="garage-brand" href="/"><img src="/assets/logo.jpg" alt=""/> VVM DETAILS</a><a className="entry-home" href="/">BACK TO THE GOOD STUFF ↗</a></header><div className="entry-grid"><section className="entry-scene" aria-label="VVM vehicle care"><div className="entry-scene-copy"><span className="entry-stamp">CLIENTS ONLY. ALL LOVE.</span><h1>GOOD CARS.<br/>BRIGHTER<br/><span>DAYS.</span></h1><p>Your ride. Your story. Your Garage.</p></div><img className="entry-car" src="/assets/white-lexus-is-front.jpg" alt="A white Lexus detailed by VVM Details"/><div className="entry-badges"><span>✦ SHOWROOM ENERGY</span><span>♥ THE VVM FAMILY</span></div></section><section className="login-card entry-card"><p className="g-eyebrow">{admin ? 'BEHIND THE SHINE' : 'YOUR PRIVATE DIGITAL GARAGE'}</p><h2>{reset ? 'Fresh start.' : admin ? 'Hello, boss.' : 'Welcome home.'}</h2><p className="g-muted">{reset ? 'Let’s get you back in. We’ll email a password reset link.' : admin ? 'Your clients, their cars, and every detail.' : 'The photos, the protection, the next shine. It’s all here.'}</p><form onSubmit={submit} className="g-form"><label>Email address<input required type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} disabled={busy}/></label>{!reset&&<label>Password<input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} disabled={busy}/></label>}<button className="g-button" disabled={busy}>{busy?'PLEASE WAIT…':reset?'SEND RESET LINK ↗':admin?'OPEN ADMIN ↗':'ENTER MY GARAGE ↗'}</button></form>{message&&<p className="g-message" role="status">{message}</p>}<button className="g-text-button" disabled={busy} onClick={()=>{setReset(!reset);setMessage('')}}>{reset?'Back to sign in':'Forgot password?'}</button>{!reset&&!admin&&<p className="g-join">New to the family? Your VVM team creates your login after your service. <a href="mailto:vvm.detailing@gmail.com">Ask us for access ↗</a></p>}<div className="entry-perks"><span>YOUR PHOTOS</span><span>YOUR PROTECTION</span><span>YOUR NEXT SHINE</span></div></section></div></main>;
}
