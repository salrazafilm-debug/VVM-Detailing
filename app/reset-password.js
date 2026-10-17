'use client';
import { useState } from 'react';
import { supabaseBrowser } from './garage-auth-client';
export default function ResetPassword() {
  const [password,setPassword]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  async function submit(e){e.preventDefault();setBusy(true);try{const {error}=await supabaseBrowser().auth.updateUser({password});if(error)throw error;setMessage('Password updated. You can now sign in.');}catch(e){setMessage(e.message||'Could not update password. Open the latest reset link from your email.');}finally{setBusy(false)}}
  return <main className="garage-shell login-shell"><a className="garage-brand" href="/"><img src="/assets/logo.jpg" alt=""/> VVM DETAILS</a><section className="login-card"><p className="g-eyebrow">ACCOUNT SECURITY</p><h1>Choose a Password</h1><form onSubmit={submit} className="g-form"><label>New password<input required minLength={8} type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="g-button" disabled={busy}>{busy?'SAVING…':'UPDATE PASSWORD'}</button></form>{message&&<p role="status" className="g-message">{message}</p>}<a className="g-back" href="/client-login">Back to sign in</a></section></main>;
}
