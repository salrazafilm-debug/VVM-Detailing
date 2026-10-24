'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { vehicleLabel, preferredGarageVehicleId } from '../server/garage-vehicle';
import { garageRequest, signOut } from './garage-auth-client';
import { sealantProgress } from '../server/garage-dates';
import GarageIcon from './garage-icons';
import GarageIntro from './garage-intro';
import './garage-showroom.css';

const tabs = [['home','Home'],['garage','My Garage'],['health','Health'],['bookings','Bookings']];
const date = value => value ? (value instanceof Date ? value : new Date(String(value).includes('T') ? value : `${value}T12:00:00Z`)).toLocaleDateString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',year:'numeric'}) : '—';
const time = value => new Date(value).toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
const todayET = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const dayMs = 86400000;
const dayNum = day => Date.parse(`${day}T00:00:00Z`)/dayMs;
const daysUntil = day => Math.max(0,Math.ceil(dayNum(day)-dayNum(todayET())));
const plusMonths = (day,n) => {const d=new Date(`${day}T12:00:00Z`);d.setUTCMonth(d.getUTCMonth()+n);return d};
const sizeName = s => ({coupe:'Coupe',sedan:'Sedan',suv:'SUV',truck:'Truck',minivan:'Mini-van'})[s] || '';
const money = cents => (cents/100).toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});
const membershipActive = v => !!v?.cycle && todayET() <= v.cycle.offer_expires_at;
const Mark = ({ ok, bad }) => <span className={`room-mark ${ok?'is-yes':bad?'is-bad':'is-no'}`}><GarageIcon name={ok?'check':'x'}/></span>;

// The one protection the owner chose in admin: ceramic sealant (3 months) or ceramic coating (years set in admin).
function protectionOf(v) {
  const type=v?.protection_type;
  if(type!=='sealant'&&type!=='coating')return null;
  const services=[...(v.services||[])].sort((a,b)=>String(b.service_date).localeCompare(String(a.service_date)));
  const label=type==='coating'?'Ceramic Coating':'Ceramic Sealant';
  const done=services.find(s=>type==='coating'?s.ceramic_coating:s.paint_sealant);
  const start=type==='sealant'&&v.cycle?v.cycle.applied_on:done?.service_date;
  if(!start)return {type,label,ok:false,pct:0,note:'Not applied yet'};
  const end=type==='sealant'&&v.cycle?v.cycle.sealant_expires_at:(()=>{const d=new Date(`${start}T12:00:00Z`);type==='coating'?d.setUTCFullYear(d.getUTCFullYear()+(v.ceramic_years||5)):d.setUTCMonth(d.getUTCMonth()+3);return d.toISOString().slice(0,10)})();
  const left=daysUntil(end),total=Math.max(1,dayNum(end)-dayNum(start));
  const note=left<=0?'Expired · Book your renewal':type==='coating'&&left>=365?`${Math.floor(left/365)} ${Math.floor(left/365)===1?'year':'years'} left`:`${left} days left`;
  return {type,label,ok:left>0,pct:Math.max(0,Math.min(100,left/total*100)),note};
}

// Health rows: an X until it is checked off in admin. The owner decides which rows each client sees.
function healthRows(v) {
  const rows=[];
  if(v?.show_headlights!==false)rows.push({key:'headlights',label:'Headlights',ok:!!v?.headlights_done,note:v?.headlights_done?'Healthy':'Not done'});
  if(v?.show_paint!==false)rows.push({key:'paint',label:'Paint condition',ok:!!v?.paint_correction,note:v?.paint_correction?'Paint correction complete':v?.recommend_paint_correction?'Paint correction recommended':'Not done'});
  const prot=protectionOf(v);
  if(prot&&v?.show_protection!==false)rows.push({key:'protection',label:prot.label,ok:prot.ok,note:prot.note,pct:prot.pct,bar:true});
  if(v?.recommend_ceramic&&v?.show_ceramic_rec!==false&&v?.protection_type!=='coating')rows.push({key:'ceramic',label:'Ceramic Coating',ok:false,note:'Recommended'});
  return rows;
}

function HealthCard({ row }) {
  return <div className={`room-sealant room-health-card${row.ok?' is-on':' is-bad'}`}><div><span className="room-label">{row.bar?'PROTECTION':'HEALTH'}</span><strong>{row.label}</strong><em>{row.note}</em></div><Mark ok={row.ok} bad/>{row.bar&&<div className="room-progress" role="progressbar" aria-label={`${row.label} time left`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(row.pct)}><span style={{width:`${row.pct}%`}}/></div>}</div>;
}

function Health({ vehicle }) {
  if(!vehicle)return <div className="room-empty"><GarageIcon name="health"/><h3>Your space is ready.</h3><p>Your vehicle’s health will show up here.</p></div>;
  const rows=healthRows(vehicle),services=vehicle.services||[],good=rows.every(r=>r.ok);
  return <>
    <p className="room-vehicle-name">{vehicleLabel(vehicle)}{vehicle.color&&<small>{vehicle.color}</small>}</p>
    {rows.length>0&&<p className={`room-health-title${good?'':' is-warn'}`}><GarageIcon name="medic"/>{good?'Your vehicle is healthy!':'Needs attention'}</p>}
    <div className="room-health-list">{rows.map(r=><HealthCard key={r.key} row={r}/>)}</div>
        <div className="room-last-card"><span className="room-label">LAST DETAIL</span>{services[0]?<><strong>{services[0].title}</strong><time>{date(services[0].service_date)}</time></>:<em>Your first detail will show up here.</em>}</div>
    <section className="room-done-box"><span className="room-label">COMPLETED SERVICES</span>{services.length?<ul>{services.map(s=><li key={s.id}><time>{date(s.service_date)}</time><strong>{s.title}</strong>{s.description&&<p>{s.description}</p>}</li>)}</ul>:<p className="room-muted">Your completed details will show up here after each visit.</p>}</section>
  </>;
}

function VehicleDetails({ vehicle, onPhoto }) {
  if(!vehicle)return <div className="room-empty"><GarageIcon name="garage"/><h3>Your space is ready.</h3><p>We’ll add your vehicle and care history here.</p></div>;
  const photos=(vehicle.photos||[]).filter(p=>p.url&&p.show_on_garage!==false).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
  return <>
    <p className="room-vehicle-name">{vehicleLabel(vehicle)}{vehicle.color&&<small>{vehicle.color}</small>}</p>
    {photos.length>0&&<div className="room-showcase">{photos.map(p=><button type="button" key={p.id} onClick={()=>onPhoto(p)} aria-label={`Open ${p.caption||'vehicle photo'}`}><img src={p.url} alt={p.caption||'Your vehicle'} loading="lazy"/></button>)}</div>}
  </>;
}

const clock = t => { const [h,m]=t.split(':').map(Number); return `${((h+11)%12)+1}:${String(m).padStart(2,'0')} ${h<12?'AM':'PM'}`; };
const addMonth = (ym,n) => { const [y,m]=ym.split('-').map(Number); const d=new Date(Date.UTC(y,m-1+n,1)); return d.toISOString().slice(0,7); };
const monthLabel = ym => new Date(`${ym}-01T12:00:00Z`).toLocaleDateString('en-US',{month:'long',year:'numeric',timeZone:'UTC'});
const dayLabel = k => new Date(`${k}T12:00:00Z`).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'});

// Full Factory Reset booking for an active membership. Calendar and times come from the website's availability; Book sends the request by email.
function ResetBooking({ vehicle, profile, onBack }) {
  const offer=vehicle.offer;
  const thisMonth=todayET().slice(0,7);
  // The options this client sees: the reset (member), paint correction and the bundle (only when enabled in admin)
  const opts=[];
  if(offer?.variation_id)opts.push({id:'reset',title:'Full Factory Reset',sub:sizeName(offer.size),plan:`${offer.variation_id}`,cents:vehicle.custom_price_cents??offer.price_cents,was:vehicle.custom_price_cents==null?offer.normal_cents:null,member:vehicle.custom_price_cents==null});
  if(vehicle.paint_offer&&vehicle.paint_price_cents!=null)opts.push({id:'paint',title:'Paint correction',sub:'Morning only · 7–11 AM · about 6 hours',plan:'PAINT-ALONE',cents:vehicle.paint_price_cents});
  if(vehicle.paint_offer&&vehicle.bundle_price_cents!=null&&offer?.variation_id)opts.push({id:'bundle',title:'Bundle & save',sub:'Reset + paint correction. Must start 7–8 AM to complete all services',plan:`${offer.variation_id}.PAINT-BUNDLE`,cents:vehicle.bundle_price_cents});
  const [choice,setChoice]=useState(opts[0]?.id||''),current=opts.find(o=>o.id===choice)||opts[0];
  const [month,setMonth]=useState(thisMonth),[days,setDays]=useState(null),[loadErr,setLoadErr]=useState(''),[day,setDay]=useState(''),[time,setTime]=useState('');
  const [name,setName]=useState(profile?.display_name||''),[phone,setPhone]=useState(profile?.phone||''),[email,setEmail]=useState(profile?.email||''),[notes,setNotes]=useState('');
  const [busy,setBusy]=useState(false),[err,setErr]=useState(''),[done,setDone]=useState(null);
  useEffect(()=>{let live=true;setDays(null);setLoadErr('');setDay('');setTime('');if(!offer?.variation_id)return;
    if(!current)return;
    fetch(`/api/availability?plan=${encodeURIComponent(current.plan)}&month=${month}`,{cache:'no-store'})
      .then(r=>r.json().then(j=>{if(!r.ok)throw new Error(j.error||'Could not load open days.');return j}))
      .then(j=>{if(live)setDays(j.days||{})}).catch(e=>{if(live)setLoadErr(e.message)});
    return()=>{live=false}},[month,current?.plan]);
  const dayKeys=Object.keys(days||{}).sort();
  async function confirm(){
    setErr('');
    if(!day||!time||!current)return setErr('Choose a day and time.');
    if(name.trim().length<2)return setErr('Enter your name.');
    if(phone.replace(/\D/g,'').length!==10)return setErr('Enter a 10-digit phone number.');
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return setErr('Enter a valid email.');
    setBusy(true);
    try{
      const r=await fetch('/api/book',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,phone,email,notes,website:'',vehicles:[vehicleLabel(vehicle)],plan:current.plan.split(',').map(x=>x.split('.')),date:day,time,coupon:current.member?offer.coupon_code:'',
        summary:`${vehicleLabel(vehicle)}: ${current.title}${current.sub?` (${current.sub})`:''}. TOTAL ${money(current.cents)}${current.member?` (membership 50% off; normal ${money(offer.normal_cents)})`:''}.`})});
      const j=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(j.error||'We could not send your request. Please call or text us to book.');
      setDone({day,time});
    }catch(e){setErr(e.message)}finally{setBusy(false)}
  }
  if(done)return <section className="room-yay" role="status" aria-live="polite">
    <span className="room-yay-badge"><GarageIcon name="check"/></span>
    <h3 className="room-yay-big">YAY!</h3>
    <p className="room-yay-sub">You're all booked and ready!</p>
    <p className="room-yay-line">Your request is in. We'll text or email you back to confirm your booking!</p>
    <p className="room-yay-when">{dayLabel(done.day)} at {clock(done.time)}</p>
    <button type="button" className="room-gold" onClick={onBack}>DONE</button>
  </section>;
  return <>
    {profile?.logo_url&&<div className="room-book-logo"><img src={profile.logo_url} alt={`${profile.display_name||'Client'} logo`}/></div>}
    <p className="room-vehicle-name">{vehicleLabel(vehicle)}</p>
    {!opts.length&&<p className="room-muted">Nothing is open to book right now. Text us to book.</p>}
    {opts.length>1&&<div className="room-options" role="radiogroup" aria-label="What to book">{opts.map(o=><button type="button" key={o.id} role="radio" aria-checked={current?.id===o.id} className={`room-option${current?.id===o.id?' is-on':''}`} onClick={()=>{setChoice(o.id);setDay('');setTime('')}}><span className="room-option-title">{o.title}</span><span className="room-muted">{o.sub}</span><strong>{money(o.cents)}</strong></button>)}</div>}
    {current&&<section className={`room-reset-card${current.member?'':' room-plain-card'}`}><span className="room-label">{current.member?'MEMBERSHIP RESET · 50% OFF':current.id==='bundle'?'BUNDLE · SAVE':'BOOKING'}</span><h3>{current.title}</h3><p className="room-reset-size">{current.sub||sizeName(offer?.size)}</p><p className="room-reset-prices">{current.was?<s>{money(current.was)}</s>:null} <strong>{money(current.cents)}</strong></p></section>}
    {current&&<><section className="room-section"><div className="room-section-heading"><h3>Pick a day</h3></div>
      <div className="room-month"><button type="button" className="room-link" disabled={month<=thisMonth} onClick={()=>setMonth(addMonth(month,-1))} aria-label="Previous month">‹ Prev</button><strong>{monthLabel(month)}</strong><button type="button" className="room-link" onClick={()=>setMonth(addMonth(month,1))} aria-label="Next month">Next ›</button></div>
      {loadErr&&<p className="room-err" role="alert">{loadErr}</p>}
      {!loadErr&&!days&&<p className="room-muted" role="status">Loading open days…</p>}
      {days&&!dayKeys.length&&<p className="room-muted">No open days this month. Try next month.</p>}
      {days&&!!dayKeys.length&&<div className="room-days">{dayKeys.map(k=><button type="button" key={k} className={`room-day${day===k?' is-on':''}`} aria-pressed={day===k} onClick={()=>{setDay(k);setTime('')}}>{dayLabel(k)}<small>{days[k].length} {days[k].length===1?"time":"times"}</small></button>)}</div>}
    </section>
    {day&&<section className="room-section"><div className="room-section-heading"><h3>Pick a time</h3><span className="room-muted">{dayLabel(day)}</span></div>
      <div className="room-times">{days[day].map(t=><button type="button" key={t} className={`room-time${time===t?' is-on':''}`} aria-pressed={time===t} onClick={()=>setTime(t)}>{clock(t)}</button>)}</div>
    </section>}
    {time&&<section className="room-section"><div className="room-section-heading"><h3>Your details</h3></div>
      <div className="room-form">
        <label>Name<input value={name} onChange={e=>setName(e.target.value)} autoComplete="name"/></label>
        <label>Phone<input value={phone} onChange={e=>setPhone(e.target.value)} inputMode="tel" autoComplete="tel"/></label>
        <label>Email<input value={email} onChange={e=>setEmail(e.target.value)} inputMode="email" autoComplete="email"/></label>
        <label>Notes <span className="room-muted">Optional</span><textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2}/></label>
      </div>
      {err&&<p className="room-err" role="alert">{err}</p>}
      <button type="button" className="room-gold" disabled={busy} onClick={confirm}>{busy?'SENDING…':'CONFIRM MY DAY'}</button>
    </section>}</>}
    <button type="button" className="room-link room-back" onClick={onBack}>‹ Back to bookings</button>
  </>;
}

// Saves the photo to the phone or computer. Falls back to opening it if the browser will not download it directly.
async function downloadPhoto(photo) {
  try {
    const r = await fetch(photo.url);
    if (!r.ok) throw new Error('download');
    const blob = await r.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `vvm-${photo.id}.${(blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')}`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 4000);
  } catch { window.open(photo.url, '_blank', 'noopener'); }
}

function Bookings({ vehicle, preview, onBook }) {
  const c=vehicle?.cycle,active=membershipActive(vehicle);
  return <>
    <section className={`room-member-card${active?'':' is-off'}`}><span className="room-member-mark"><Mark ok={active}/></span><span className="room-label">VVM MAINTENANCE MEMBERSHIP</span><h3>{active?'ACTIVE':c?'EXPIRED':'NOT ACTIVE'}</h3>{active?<><p>Maintenance recommended on <strong>{date(plusMonths(c.applied_on,1))}</strong></p><p className="room-member-note">Membership expires {date(c.offer_expires_at)}.</p></>:<p>Book a detail with sealant to start your membership.</p>}</section>
    {vehicle?.appointments?.length?<ul className="room-bookings">{vehicle.appointments.map(a=><li key={a.id}><GarageIcon name="bookings"/><div><span className="room-badge">{a.status==='requested'?'REQUESTED':'CONFIRMED'}</span><h3>{a.service_label}</h3><strong>{date(a.starts_at)}</strong><p>{time(a.starts_at)}</p></div></li>)}</ul>:null}
    {vehicle?.paint_offer&&!(active&&vehicle?.offer?.variation_id)&&<section className="room-reset-card room-plain-card"><span className="room-label">PAINT CORRECTION</span><h3>Book paint correction</h3><p className="room-reset-size">Morning only · 7–11 AM · about 6 hours</p>{vehicle.paint_price_cents!=null&&<p className="room-reset-prices"><strong>{money(vehicle.paint_price_cents)}</strong></p>}<button type="button" className="room-gold" onClick={onBook}>BOOK MY DAY</button></section>}
    {active&&vehicle?.offer?.variation_id?<section className="room-reset-card"><span className="room-label">MEMBERSHIP RESET · 50% OFF</span><h3>Full Factory Reset</h3><p className="room-reset-size">{sizeName(vehicle.offer.size)}</p><p className="room-reset-prices">{vehicle.offer.normal_cents?<s>{money(vehicle.offer.normal_cents)}</s>:null} <strong>{vehicle.offer.price_cents?money(vehicle.offer.price_cents):'Ask us'}</strong></p><p className="room-small">Open until {date(vehicle.offer.expires_at)}</p><button type="button" className="room-gold" onClick={onBook}>BOOK MY DAY</button></section>
    :active&&vehicle?<section className="room-membership-note"><span className="room-label">YOUR MEMBERSHIP IS ACTIVE</span><p>You're receiving <strong>50% off</strong> on your next detail. Expires in <strong>{daysUntil(vehicle.cycle.offer_expires_at)} days</strong> ({date(vehicle.cycle.offer_expires_at)}).</p>{!vehicle.vehicle_size&&<p className="room-small">Your reset size is being set up. Text us and we'll book it.</p>}</section>:null}

    <p className="room-small">Need to change a visit? <a href="sms:+12406019451">Text us</a>{!preview&&<> · <a href="/reset-password">Change password</a> · <button type="button" className="room-link" onClick={signOut}>Sign out</button></>}</p>
  </>;
}

export default function Garage() {
  const [data,setData]=useState(null),[selected,setSelected]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true),[view,setView]=useState(()=>{try{const v=new URLSearchParams(location.search).get('view');return ['home','garage','health','bookings'].includes(v)?v:'home'}catch{return 'home'}}),[photo,setPhoto]=useState(null),[imageFailed,setImageFailed]=useState(false),[legacyCutout,setLegacyCutout]=useState(false),[isPhone,setIsPhone]=useState(false),[introDone,setIntroDone]=useState(false),[booking,setBooking]=useState(false),[sizeOverride,setSizeOverride]=useState(null),[coverLoaded,setCoverLoaded]=useState(''),[coverWaitDone,setCoverWaitDone]=useState(false),[,refreshClock]=useState(0);
  const heading=useRef(null),dialog=useRef(null),previousFocus=useRef(null);
  useEffect(()=>{
    let active=true;
    const client=new URLSearchParams(location.search).get('client');
    async function load(){try{const d=await garageRequest(`/api/garage${client?`?client=${encodeURIComponent(client)}`:''}`,{cache:'no-store'});if(active){setData(d);setSelected(id=>preferredGarageVehicleId(d.vehicles,id||new URLSearchParams(location.search).get('vehicle')||''));setError('');
        // Start downloading every photo now, while the intro shows, so My Garage opens with them ready.
        for(const v of d.vehicles)for(const p of v.photos||[])if(p.url){const pre=new Image();pre.src=p.url}}}catch(e){if(active)setError(e.message)}finally{if(active)setLoading(false)}}
    load();const timer=setInterval(load,10*60*1000),clock=setInterval(()=>refreshClock(n=>n+1),60000);const visible=()=>{if(document.visibilityState==='visible')load()};document.addEventListener('visibilitychange',visible);
    return()=>{active=false;clearInterval(timer);clearInterval(clock);document.removeEventListener('visibilitychange',visible)};
  },[]);
  // Admin preview only: size and position from the admin sliders, shown before they are saved
  useEffect(()=>{if(!data?.preview)return;const h=e=>{if(e.origin!==location.origin||e.data?.type!=='vvm-showroom-size')return;setSizeOverride(e.data.sizes)};window.addEventListener('message',h);return()=>window.removeEventListener('message',h)},[data?.preview]);
  useEffect(()=>{const t=setTimeout(()=>setIntroDone(true),5000),w=setTimeout(()=>setCoverWaitDone(true),12000);return()=>{clearTimeout(t);clearTimeout(w)}},[]);
  useEffect(()=>{if(view!=='home')heading.current?.focus({preventScroll:true})},[view]);
  // Safari colours its bottom bar from theme-color. Black here, so the bar matches the photo instead of showing pink.
  useEffect(()=>{let meta=document.querySelector('meta[name="theme-color"]');const made=!meta;if(made){meta=document.createElement('meta');meta.name='theme-color';document.head.appendChild(meta)}const was=meta.content;meta.content='#000000';return()=>{if(made)meta.remove();else meta.content=was}},[]);
  useEffect(()=>{const mq=matchMedia('(max-width:800px)');setIsPhone(mq.matches);const change=()=>setIsPhone(mq.matches);mq.addEventListener('change',change);return()=>mq.removeEventListener('change',change)},[]);
  useEffect(()=>{setImageFailed(false);setLegacyCutout(false);setPhoto(null)},[selected,data]);
  useEffect(()=>{if(photo){previousFocus.current=document.activeElement;dialog.current?.showModal()}else if(dialog.current?.open){dialog.current.close();previousFocus.current?.focus()}},[photo]);
  const vehicle=useMemo(()=>data?.vehicles.find(v=>v.id===selected),[data,selected]);
  const coverId=isPhone&&vehicle?.mobile_hero_photo_id?vehicle.mobile_hero_photo_id:vehicle?.hero_photo_id;
  const dev=isPhone?'phone':'desktop',live=sizeOverride?.[dev],sc=live?.scale??vehicle?.[`${dev}_scale`]??100,sx=live?.x??vehicle?.[`${dev}_x`]??50,sy=live?.y??vehicle?.[`${dev}_y`]??58,place={'--ss':sc/100,'--sx':`${sx-50}%`,'--sy':`${sy-58}%`};
  const hero=vehicle?.photos.find(p=>p.id===coverId) || vehicle?.photos.find(p=>p.id===vehicle.hero_photo_id) || vehicle?.photos.find(p=>p.photo_kind==='hero') || vehicle?.photos.find(p=>p.photo_kind==='after');
  const firstName=(data?.profile?.display_name||'').trim().split(/\s+/)[0];
  function navigate(next){setView(next);setPhoto(null);setBooking(false)}
  const title={health:'HEALTH',garage:'MY GARAGE',bookings:'BOOKINGS'}[view],logo=data?.profile?.logo_url;
  // Keep the intro until the cover photo has loaded (or 12 seconds pass), so the Garage opens with its photo ready.
  const waitingCover=!!hero?.url&&!imageFailed&&coverLoaded!==hero.url&&!coverWaitDone;
  const showIntro=!introDone||loading||waitingCover;
  return <main className={`garage-shell client-showroom${(hero?.url&&!imageFailed&&!(hero.is_cutout||legacyCutout))?"":" is-black"}`}>
    {showIntro&&<GarageIntro/>}
    {(()=>{const scene=hero?.url&&!imageFailed&&!(hero.is_cutout||legacyCutout);return scene?<img className="showroom-room is-scene" style={place} src={hero.url} alt={`${vehicleLabel(vehicle)} in ${firstName?`${firstName}’s`:"your"} Garage`} fetchPriority="high" onLoad={()=>setCoverLoaded(hero.url)} onError={()=>setImageFailed(true)}/>:<div className="showroom-room is-black" role="img" aria-label="Black showroom"/>})()}
    <header className="room-header"><a className="room-banner" href="/" aria-label="VVM Details website"><img src="/assets/garage/vvm-badge.webp" alt="" width="400" height="400"/><span><small>{data?.preview?'CLIENT PREVIEW':'VVM DETAILS'}</small><strong>{firstName?`${firstName.toUpperCase()}’S`:'YOUR'} GARAGE</strong></span></a>{data?.preview&&<a className="room-preview-back" href="/garage-admin">Back to admin</a>}</header>
    {data&&(()=>{const on=membershipActive(vehicle);return <button className={`room-membership${on?'':' is-off'}`} type="button" onClick={()=>navigate('bookings')}><Mark ok={on}/><span><small>MAINTENANCE MEMBERSHIP</small><strong><b className="room-pill-short">MEMBERSHIP </b>{on?'ACTIVE':vehicle?.cycle?'EXPIRED':'NOT ACTIVE'}</strong></span></button>})()}
    {loading?<p className="room-loading" role="status">Opening your Garage…</p>:!data?<section className="room-auth-error"><h1>Your Garage awaits.</h1><p role="alert">{error||'Please sign in to open your Garage.'}</p><a className="room-primary" href="/client-login">ENTER MY GARAGE <GarageIcon name="arrow"/></a></section>:<>
      {error&&<p className="room-refresh-error" role="status">Couldn’t refresh your Garage. {error}</p>}
      {view==='home'&&<section className="room-home" aria-label="Your vehicle showroom">
        {hero?.url&&!imageFailed&&!(hero.is_cutout||legacyCutout)?null:hero?.url&&!imageFailed?<button className={`showroom-car${hero.is_cutout||legacyCutout?' is-cutout':' is-photo'}`} style={place} type="button" onClick={()=>navigate('garage')} aria-label={`View ${vehicleLabel(vehicle)} details`}><img src={hero.url} alt={vehicleLabel(vehicle)} crossOrigin="anonymous" onLoad={e=>{setCoverLoaded(hero.url);if(hero.is_cutout)return;try{const c=document.createElement('canvas');c.width=64;c.height=64;const ctx=c.getContext('2d');ctx.drawImage(e.currentTarget,0,0,64,64);const pixels=ctx.getImageData(0,0,64,64).data;for(let i=3;i<pixels.length;i+=4)if(pixels[i]<32){setLegacyCutout(true);break}}catch{}}} onError={()=>setImageFailed(true)}/></button>:<div className="room-awaiting"><span className="room-label">YOUR SPACE. YOUR RIDE.</span><h1>{firstName?`Welcome, ${firstName}.`:'Welcome to your Garage.'}</h1><p>{(imageFailed||(hero&&!hero.url))?'Your photo is temporarily unavailable. Please reopen your Garage.':vehicle?'Your showroom is ready for your vehicle photo.':'Your showroom is ready. Your vehicle will appear here once added.'}</p></div>}
        <div className="room-vehicle-plate">{data.vehicles.length>1?<label htmlFor="showroom-vehicle">YOUR VEHICLE<select id="showroom-vehicle" value={selected} onChange={e=>setSelected(e.target.value)}>{data.vehicles.map(v=><option key={v.id} value={v.id}>{vehicleLabel(v)}</option>)}</select></label>:vehicle?<><span className="room-label">YOUR VEHICLE</span><strong>{vehicleLabel(vehicle)}</strong></>:<><span className="room-label">A LITTLE LOVE. EVERY DETAIL.</span><strong>Your story starts here.</strong></>}{vehicle&&<button className="room-plate-action" type="button" onClick={()=>navigate('garage')} aria-label="View protection and care history"><GarageIcon name="shield"/></button>}</div>
      </section>}
      {view!=='home'&&<section className="client-sheet" aria-labelledby="room-panel-title"><div className="room-sheet-head"><h1 id="room-panel-title" tabIndex="-1" ref={heading} className={view==='garage'&&logo?'has-logo':''}>{view==='garage'&&logo?<img className="room-garage-logo" src={logo} alt={`${firstName?`${firstName}’s `:''}Garage`}/>:title}</h1><button className="room-close" onClick={()=>navigate('home')} aria-label="Return to showroom"><GarageIcon name="close"/></button></div>
        {data.vehicles.length>1&&['garage','health','bookings'].includes(view)&&<label className="room-sheet-vehicle">Vehicle<select aria-label="Select vehicle" value={selected} onChange={e=>setSelected(e.target.value)}>{data.vehicles.map(v=><option key={v.id} value={v.id}>{vehicleLabel(v)}</option>)}</select></label>}
        {view==='health'&&<Health vehicle={vehicle}/>}
        {view==='garage'&&<VehicleDetails vehicle={vehicle} onPhoto={setPhoto}/>}
        {view==='bookings'&&(booking&&(vehicle?.offer?.variation_id||vehicle?.paint_offer)?<ResetBooking vehicle={vehicle} profile={data.profile} onBack={()=>setBooking(false)}/>:<Bookings vehicle={vehicle} preview={data.preview} onBook={()=>setBooking(true)}/>)}
      </section>}
    </>}
    {data&&<nav className="room-nav" aria-label="Garage navigation">{tabs.map(([id,label])=><button key={id} type="button" className={view===id?'is-active':''} aria-pressed={view===id} onClick={()=>navigate(id)}><GarageIcon name={id}/><span>{label}</span></button>)}</nav>}
    <dialog className="room-photo-dialog" ref={dialog} onCancel={e=>{e.preventDefault();setPhoto(null)}} onClick={e=>{if(e.target===e.currentTarget)setPhoto(null)}} aria-label="Vehicle photo">{photo&&<><button className="room-close" onClick={()=>setPhoto(null)} aria-label="Close photo"><GarageIcon name="close"/></button><img src={photo.url} alt={photo.caption||'Your vehicle'}/><button type="button" className="room-gold room-download" onClick={()=>downloadPhoto(photo)}>DOWNLOAD PHOTO</button></>}</dialog>
  </main>;
}
