'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { vehicleLabel, preferredGarageVehicleId } from '../server/garage-vehicle';
import { garageRequest, signOut } from './garage-auth-client';
import { sealantProgress } from '../server/garage-dates';
import GarageIcon from './garage-icons';
import './garage-showroom.css';

const tabs = [['home','Home'],['garage','My Garage'],['services','Services'],['bookings','Bookings']];
const date = value => value ? (value instanceof Date ? value : new Date(String(value).includes('T') ? value : `${value}T12:00:00Z`)).toLocaleDateString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',year:'numeric'}) : '—';
const time = value => new Date(value).toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
const todayET = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const daysUntil = day => Math.max(0,Math.ceil((Date.parse(`${day}T00:00:00Z`)-Date.parse(`${todayET()}T00:00:00Z`))/86400000));
const plusMonths = (day,n) => {const d=new Date(`${day}T12:00:00Z`);d.setUTCMonth(d.getUTCMonth()+n);return d};
const has = (v,k) => !!v?.[k] || (v?.services||[]).some(s=>s[k]);
const membershipActive = v => !!v?.cycle && todayET() <= v.cycle.offer_expires_at;
// Ceramic counts down in years from the latest coating (years set in admin, 5 by default)
function ceramicLeft(v) {
  const s=(v?.services||[]).find(x=>x.ceramic_coating);
  if(!s)return null;
  const end=new Date(`${s.service_date}T12:00:00Z`);end.setUTCFullYear(end.getUTCFullYear()+(v.ceramic_years||5));
  const days=daysUntil(end.toISOString().slice(0,10));
  return days>=365?`${Math.floor(days/365)} ${Math.floor(days/365)===1?'YEAR':'YEARS'} LEFT`:days>0?`${days} DAYS LEFT`:'TIME TO RENEW';
}
const Mark = ({ ok }) => <span className={`room-mark ${ok?'is-yes':'is-no'}`}><GarageIcon name={ok?'check':'x'}/></span>;

function Services({ vehicle }) {
  const services=vehicle?.services||[],ceramic=ceramicLeft(vehicle),c=vehicle?.cycle,sealant=c&&daysUntil(c.sealant_expires_at);
  const recs=[['Headlights','recommend_headlights'],['Paint Correction','recommend_paint_correction'],['Ceramic Coating','recommend_ceramic']];
  const any=recs.some(([,k])=>vehicle?.[k]);
  return <>
    {(ceramic||c)&&<section className="room-active"><span className="room-label">PAINT PROTECTION</span>{ceramic&&<p><Mark ok/><strong>Ceramic Coating</strong><b>{ceramic}</b></p>}{c&&<p><Mark ok={sealant>0}/><strong>Ceramic Sealant</strong><b>{sealant>0?`${sealant} DAYS LEFT`:'TIME TO RENEW'}</b></p>}</section>}
    <section className="room-section"><div className="room-section-heading"><h3>Completed services</h3></div>{services.length?<ul className="room-history">{services.map(s=><li key={s.id}><time>{date(s.service_date)}</time><strong>{s.title}</strong>{s.description&&<p>{s.description}</p>}</li>)}</ul>:<p className="room-muted">Your completed details will show up here after each visit.</p>}</section>
    <section className="room-section"><div className="room-section-heading"><h3>Recommended</h3></div>{!any&&<p className="room-allset"><Mark ok/>You’re all set on recommended services.</p>}<ul className="room-recs">{recs.map(([n,k])=><li key={k} className={vehicle?.[k]?'is-rec':''}><span>{n}</span><b>{vehicle?.[k]?'RECOMMENDED':'HEALTHY'}</b></li>)}</ul>{any&&<a className="room-gold" href="/#book">BOOK MY DAY</a>}</section>
  </>;
}

function VehicleDetails({ vehicle, onPhoto }) {
  if(!vehicle)return <div className="room-empty"><GarageIcon name="garage"/><h3>Your space is ready.</h3><p>We’ll add your vehicle and care history here.</p></div>;
  const c=vehicle.cycle,progress=sealantProgress(c),photos=(vehicle.photos||[]).filter(p=>p.url),services=vehicle.services||[],left=c?daysUntil(c.sealant_expires_at):0;
  const steps=[['Ceramic Coating',has(vehicle,'ceramic_coating')],['Paint Correction',!!vehicle.paint_correction],['Leather / Fabric Coating',has(vehicle,'leather_protection')||has(vehicle,'fabric_protection')]];
  return <>
    <p className="room-vehicle-name">{vehicleLabel(vehicle)}{vehicle.color&&<small>{vehicle.color}</small>}</p>
    <section className="room-section"><div className="room-section-heading"><h3>Protection</h3></div>
      <ol className="room-steps">{steps.map(([n,ok],i)=><li key={n} className={ok?'is-yes':''}><span className="room-step-num">{i+1}</span><strong>{n}</strong><Mark ok={ok}/></li>)}</ol>
      <div className={`room-sealant${c&&left>0?' is-on':''}`}><div><span className="room-label">CERAMIC SEALANT</span><strong>{c?left>0?`${left} days left`:'Time to renew':'Not applied yet'}</strong></div><Mark ok={!!c&&left>0}/>{c&&<div className="room-progress" role="progressbar" aria-label="Sealant time left" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(100-progress.value)}><span style={{width:`${100-progress.value}%`}}/></div>}</div>
    </section>
    <section className="room-section"><div className="room-section-heading"><h3>Last detail</h3></div>{services[0]?<p className="room-last"><strong>{services[0].title}</strong><time>{date(services[0].service_date)}</time></p>:<p className="room-muted">Your first detail will show up here.</p>}</section>
    <section className="room-section"><div className="room-section-heading"><h3>Your photos</h3></div>{photos.length?<div className="room-gallery">{photos.map(p=><button type="button" key={p.id} onClick={()=>onPhoto(p)} aria-label={`Open ${p.caption||'vehicle photo'}`}><img src={p.url} alt={p.caption||'Your vehicle'} loading="lazy"/></button>)}</div>:<p className="room-muted">Your photos will show up here after your detail.</p>}</section>
  </>;
}

function Bookings({ vehicle, preview }) {
  const c=vehicle?.cycle,active=membershipActive(vehicle);
  return <>
    <section className={`room-member-card${active?'':' is-off'}`}><span className="room-member-mark"><Mark ok={active}/></span><span className="room-label">VVM MAINTENANCE MEMBERSHIP</span><h3>{active?'ACTIVE':c?'EXPIRED':'NOT ACTIVE'}</h3>{active?<><p>Maintenance recommended on <strong>{date(plusMonths(c.applied_on,1))}</strong></p><p className="room-member-note">Membership expires {date(c.offer_expires_at)}.</p></>:<p>Book a detail with sealant to start your membership.</p>}</section>
    {vehicle?.appointments?.length?<ul className="room-bookings">{vehicle.appointments.map(a=><li key={a.id}><GarageIcon name="bookings"/><div><span className="room-badge">{a.status==='requested'?'REQUESTED':'CONFIRMED'}</span><h3>{a.service_label}</h3><strong>{date(a.starts_at)}</strong><p>{time(a.starts_at)}</p></div></li>)}</ul>:null}
    <a className="room-gold" href="/#book">BOOK MY DAY</a>
    <p className="room-small">Need to change a visit? <a href="sms:+12406019451">Text us</a>{!preview&&<> · <a href="/reset-password">Change password</a> · <button type="button" className="room-link" onClick={signOut}>Sign out</button></>}</p>
  </>;
}

export default function Garage() {
  const [data,setData]=useState(null),[selected,setSelected]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true),[view,setView]=useState('home'),[photo,setPhoto]=useState(null),[imageFailed,setImageFailed]=useState(false),[legacyCutout,setLegacyCutout]=useState(false),[,refreshClock]=useState(0);
  const heading=useRef(null),dialog=useRef(null),previousFocus=useRef(null);
  useEffect(()=>{
    let active=true;
    const client=new URLSearchParams(location.search).get('client');
    async function load(){try{const d=await garageRequest(`/api/garage${client?`?client=${encodeURIComponent(client)}`:''}`,{cache:'no-store'});if(active){setData(d);setSelected(id=>preferredGarageVehicleId(d.vehicles,id));setError('')}}catch(e){if(active)setError(e.message)}finally{if(active)setLoading(false)}}
    load();const timer=setInterval(load,10*60*1000),clock=setInterval(()=>refreshClock(n=>n+1),60000);const visible=()=>{if(document.visibilityState==='visible')load()};document.addEventListener('visibilitychange',visible);
    return()=>{active=false;clearInterval(timer);clearInterval(clock);document.removeEventListener('visibilitychange',visible)};
  },[]);
  useEffect(()=>{if(view!=='home')heading.current?.focus({preventScroll:true})},[view]);
  useEffect(()=>{setImageFailed(false);setLegacyCutout(false);setPhoto(null)},[selected,data]);
  useEffect(()=>{if(photo){previousFocus.current=document.activeElement;dialog.current?.showModal()}else if(dialog.current?.open){dialog.current.close();previousFocus.current?.focus()}},[photo]);
  const vehicle=useMemo(()=>data?.vehicles.find(v=>v.id===selected),[data,selected]);
  const hero=vehicle?.photos.find(p=>p.id===vehicle.hero_photo_id) || vehicle?.photos.find(p=>p.photo_kind==='hero') || vehicle?.photos.find(p=>p.photo_kind==='after');
  const firstName=(data?.profile?.display_name||'').trim().split(/\s+/)[0];
  function navigate(next){setView(next);setPhoto(null)}
  const title={services:vehicle?vehicleLabel(vehicle):'Services',garage:'MY GARAGE',bookings:'BOOKINGS'}[view];
  return <main className="garage-shell client-showroom">
    {(()=>{const scene=hero?.url&&!imageFailed&&!(hero.is_cutout||legacyCutout);return <img className={`showroom-room${scene?" is-scene":""}`} src={scene?hero.url:"/assets/garage/showroom.webp"} alt={scene?`${vehicleLabel(vehicle)} in ${firstName?`${firstName}’s`:"your"} Garage`:"Pink detailing showroom with white ceiling lights and a glossy tiled floor"} fetchPriority="high" onError={()=>setImageFailed(true)}/>})()}
    <header className="room-header"><a className="room-banner" href="/" aria-label="VVM Details website"><img src="/assets/garage/vvm-badge.webp" alt="" width="400" height="400"/><span><small>{data?.preview?'CLIENT PREVIEW':'VVM DETAILS'}</small><strong>{firstName?`${firstName.toUpperCase()}’S`:'YOUR'} GARAGE</strong></span></a>{data?.preview&&<a className="room-preview-back" href="/garage-admin">Back to admin</a>}</header>
    {data&&(()=>{const on=membershipActive(vehicle);return <button className={`room-membership${on?'':' is-off'}`} type="button" onClick={()=>navigate('bookings')}><Mark ok={on}/><span><small>MAINTENANCE MEMBERSHIP</small><strong>{on?'ACTIVE':vehicle?.cycle?'EXPIRED':'NOT ACTIVE'}</strong></span></button>})()}
    {loading?<p className="room-loading" role="status">Opening your Garage…</p>:!data?<section className="room-auth-error"><h1>Your Garage awaits.</h1><p role="alert">{error||'Please sign in to open your Garage.'}</p><a className="room-primary" href="/client-login">ENTER MY GARAGE <GarageIcon name="arrow"/></a></section>:<>
      {error&&<p className="room-refresh-error" role="status">Couldn’t refresh your Garage. {error}</p>}
      {view==='home'&&<section className="room-home" aria-label="Your vehicle showroom">
        {hero?.url&&!imageFailed&&!(hero.is_cutout||legacyCutout)?null:hero?.url&&!imageFailed?<button className={`showroom-car${hero.is_cutout||legacyCutout?' is-cutout':' is-photo'}`} type="button" onClick={()=>navigate('garage')} aria-label={`View ${vehicleLabel(vehicle)} details`}><img src={hero.url} alt={vehicleLabel(vehicle)} crossOrigin="anonymous" onLoad={e=>{if(hero.is_cutout)return;try{const c=document.createElement('canvas');c.width=64;c.height=64;const ctx=c.getContext('2d');ctx.drawImage(e.currentTarget,0,0,64,64);const pixels=ctx.getImageData(0,0,64,64).data;for(let i=3;i<pixels.length;i+=4)if(pixels[i]<32){setLegacyCutout(true);break}}catch{}}} onError={()=>setImageFailed(true)}/></button>:<div className="room-awaiting"><span className="room-label">YOUR SPACE. YOUR RIDE.</span><h1>{firstName?`Welcome, ${firstName}.`:'Welcome to your Garage.'}</h1><p>{(imageFailed||(hero&&!hero.url))?'Your photo is temporarily unavailable. Please reopen your Garage.':vehicle?'Your showroom is ready for your vehicle photo.':'Your showroom is ready. Your vehicle will appear here once added.'}</p></div>}
        <div className="room-vehicle-plate">{data.vehicles.length>1?<label htmlFor="showroom-vehicle">YOUR VEHICLE<select id="showroom-vehicle" value={selected} onChange={e=>setSelected(e.target.value)}>{data.vehicles.map(v=><option key={v.id} value={v.id}>{vehicleLabel(v)}</option>)}</select></label>:vehicle?<><span className="room-label">YOUR VEHICLE</span><strong>{vehicleLabel(vehicle)}</strong></>:<><span className="room-label">A LITTLE LOVE. EVERY DETAIL.</span><strong>Your story starts here.</strong></>}{vehicle&&<button className="room-plate-action" type="button" onClick={()=>navigate('garage')} aria-label="View protection and care history"><GarageIcon name="shield"/></button>}</div>
      </section>}
      {view!=='home'&&<section className="client-sheet" aria-labelledby="room-panel-title"><div className="room-sheet-head"><h1 id="room-panel-title" tabIndex="-1" ref={heading}>{title}</h1><button className="room-close" onClick={()=>navigate('home')} aria-label="Return to showroom"><GarageIcon name="close"/></button></div>
        {data.vehicles.length>1&&['garage','services','bookings'].includes(view)&&<label className="room-sheet-vehicle">Vehicle<select aria-label="Select vehicle" value={selected} onChange={e=>setSelected(e.target.value)}>{data.vehicles.map(v=><option key={v.id} value={v.id}>{vehicleLabel(v)}</option>)}</select></label>}
        {view==='services'&&<Services vehicle={vehicle}/>}
        {view==='garage'&&<VehicleDetails vehicle={vehicle} onPhoto={setPhoto}/>}
        {view==='bookings'&&<Bookings vehicle={vehicle} preview={data.preview}/>}
      </section>}
    </>}
    {data&&<nav className="room-nav" aria-label="Garage navigation">{tabs.map(([id,label])=><button key={id} type="button" className={view===id?'is-active':''} aria-pressed={view===id} onClick={()=>navigate(id)}><GarageIcon name={id}/><span>{label}</span></button>)}</nav>}
    <dialog className="room-photo-dialog" ref={dialog} onCancel={e=>{e.preventDefault();setPhoto(null)}} onClick={e=>{if(e.target===e.currentTarget)setPhoto(null)}} aria-label="Vehicle photo">{photo&&<><button className="room-close" onClick={()=>setPhoto(null)} aria-label="Close photo"><GarageIcon name="close"/></button><img src={photo.url} alt={photo.caption||'Your vehicle'}/><p>{photo.caption||photo.photo_kind}</p></>}</dialog>
  </main>;
}
