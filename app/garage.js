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
  if(v?.show_paint!==false)rows.push({key:'paint',label:'Paint condition',ok:!!v?.paint_correction,note:v?.paint_correction?'Paint correction complete':'Not done'});
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
    {rows.some(r=>!r.ok)&&<a className="room-gold" href="/#book">BOOK MY DAY</a>}
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
  const [data,setData]=useState(null),[selected,setSelected]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true),[view,setView]=useState(()=>{try{const v=new URLSearchParams(location.search).get('view');return ['home','garage','health','bookings'].includes(v)?v:'home'}catch{return 'home'}}),[photo,setPhoto]=useState(null),[imageFailed,setImageFailed]=useState(false),[legacyCutout,setLegacyCutout]=useState(false),[isPhone,setIsPhone]=useState(false),[introDone,setIntroDone]=useState(false),[coverLoaded,setCoverLoaded]=useState(''),[coverWaitDone,setCoverWaitDone]=useState(false),[,refreshClock]=useState(0);
  const heading=useRef(null),dialog=useRef(null),previousFocus=useRef(null);
  useEffect(()=>{
    let active=true;
    const client=new URLSearchParams(location.search).get('client');
    async function load(){try{const d=await garageRequest(`/api/garage${client?`?client=${encodeURIComponent(client)}`:''}`,{cache:'no-store'});if(active){setData(d);setSelected(id=>preferredGarageVehicleId(d.vehicles,id||new URLSearchParams(location.search).get('vehicle')||''));setError('')}}catch(e){if(active)setError(e.message)}finally{if(active)setLoading(false)}}
    load();const timer=setInterval(load,10*60*1000),clock=setInterval(()=>refreshClock(n=>n+1),60000);const visible=()=>{if(document.visibilityState==='visible')load()};document.addEventListener('visibilitychange',visible);
    return()=>{active=false;clearInterval(timer);clearInterval(clock);document.removeEventListener('visibilitychange',visible)};
  },[]);
  useEffect(()=>{const t=setTimeout(()=>setIntroDone(true),5000),w=setTimeout(()=>setCoverWaitDone(true),12000);return()=>{clearTimeout(t);clearTimeout(w)}},[]);
  useEffect(()=>{if(view!=='home')heading.current?.focus({preventScroll:true})},[view]);
  useEffect(()=>{const mq=matchMedia('(max-width:800px)');setIsPhone(mq.matches);const change=()=>setIsPhone(mq.matches);mq.addEventListener('change',change);return()=>mq.removeEventListener('change',change)},[]);
  useEffect(()=>{setImageFailed(false);setLegacyCutout(false);setPhoto(null)},[selected,data]);
  useEffect(()=>{if(photo){previousFocus.current=document.activeElement;dialog.current?.showModal()}else if(dialog.current?.open){dialog.current.close();previousFocus.current?.focus()}},[photo]);
  const vehicle=useMemo(()=>data?.vehicles.find(v=>v.id===selected),[data,selected]);
  const coverId=isPhone&&vehicle?.mobile_hero_photo_id?vehicle.mobile_hero_photo_id:vehicle?.hero_photo_id;
  const dev=isPhone?'phone':'desktop',place={'--ss':(vehicle?.[`${dev}_scale`]??100)/100,'--sx':`${(vehicle?.[`${dev}_x`]??50)-50}%`,'--sy':`${(vehicle?.[`${dev}_y`]??58)-58}%`};
  const hero=vehicle?.photos.find(p=>p.id===coverId) || vehicle?.photos.find(p=>p.id===vehicle.hero_photo_id) || vehicle?.photos.find(p=>p.photo_kind==='hero') || vehicle?.photos.find(p=>p.photo_kind==='after');
  const firstName=(data?.profile?.display_name||'').trim().split(/\s+/)[0];
  function navigate(next){setView(next);setPhoto(null)}
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
        {view==='bookings'&&<Bookings vehicle={vehicle} preview={data.preview}/>}
      </section>}
    </>}
    {data&&<nav className="room-nav" aria-label="Garage navigation">{tabs.map(([id,label])=><button key={id} type="button" className={view===id?'is-active':''} aria-pressed={view===id} onClick={()=>navigate(id)}><GarageIcon name={id}/><span>{label}</span></button>)}</nav>}
    <dialog className="room-photo-dialog" ref={dialog} onCancel={e=>{e.preventDefault();setPhoto(null)}} onClick={e=>{if(e.target===e.currentTarget)setPhoto(null)}} aria-label="Vehicle photo">{photo&&<><button className="room-close" onClick={()=>setPhoto(null)} aria-label="Close photo"><GarageIcon name="close"/></button><img src={photo.url} alt={photo.caption||'Your vehicle'}/><p>{photo.caption||photo.photo_kind}</p></>}</dialog>
  </main>;
}
