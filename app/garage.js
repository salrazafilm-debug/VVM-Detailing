'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { vehicleLabel, preferredGarageVehicleId } from '../server/garage-vehicle';
import { garageRequest, signOut } from './garage-auth-client';
import { sealantProgress } from '../server/garage-dates';
import GarageIcon from './garage-icons';
import './garage-showroom.css';

const tabs = [['home','Home'],['services','Services'],['garage','My Garage'],['bookings','Bookings'],['profile','Profile']];
const date = value => value ? new Date(value.includes('T') ? value : `${value}T12:00:00Z`).toLocaleDateString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',year:'numeric'}) : '—';
const time = value => new Date(value).toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
const money = cents => (cents/100).toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2});
const isInterior = photo => photo.photo_kind==='interior' || /interior/i.test(photo.caption||'');

function Services() {
  const [services,setServices]=useState(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{let active=true;setError('');fetch('/api/services').then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||'Could not load services.');if(active)setServices(d.services||[])}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[retry]);
  return <><p className="room-lede">A little love, down to the last detail.</p>{error?<div className="room-empty"><p role="alert">{error}</p><button className="room-link" onClick={()=>setRetry(v=>v+1)}>Try again</button></div>:!services?<p role="status">Loading available services…</p>:services.length?<div className="room-services">{services.map(service=><article key={service.name}><h3>{service.name}</h3><ul>{service.variations.map(v=><li key={v.id}><span>{v.label}</span><strong>{money(v.priceCents)}</strong></li>)}</ul><a className="room-link" href="/#book">Book online <GarageIcon name="arrow"/></a></article>)}</div>:<p className="room-empty">Services are being updated. Contact us for help booking.</p>}<a className="room-primary" href="/#book">BOOK MY DAY <GarageIcon name="arrow"/></a></>;
}

function Offer({ vehicle }) {
  const offer=vehicle?.offer;
  return offer?<div className="room-offer"><span className="room-label">JUST FOR YOUR VEHICLE</span><h3>{offer.title||'Full Factory Reset'}</h3><p className="room-offer-value">{offer.discount_percent||50}% OFF</p><p>Available through {date(offer.expires_at)}.</p><p>Your code <strong className="room-code">{offer.coupon_code}</strong></p><a className="room-primary" href={`/?coupon=${encodeURIComponent(offer.coupon_code)}#book`}>REDEEM & BOOK <GarageIcon name="arrow"/></a></div>:<div className="room-empty"><GarageIcon name="gift"/><h3>A little extra love.</h3><p>No active offer for {vehicle?'this vehicle':'your account'} right now. Any available offer will appear here.</p><a className="room-primary" href="/#book">EXPLORE YOUR NEXT DETAIL <GarageIcon name="arrow"/></a></div>;
}

function VehicleDetails({ vehicle, onPhoto }) {
  if(!vehicle)return <div className="room-empty"><GarageIcon name="garage"/><h3>Your space is ready.</h3><p>We’ll add your vehicle and care history here. Your showroom stays ready for its arrival.</p></div>;
  const progress=sealantProgress(vehicle.cycle),photos=vehicle.photos||[],services=vehicle.services||[];
  return <><p className="room-lede">{vehicleLabel(vehicle)}{vehicle.color?` · ${vehicle.color}`:''}</p><section className="room-section"><div className="room-section-heading"><h3>Protection</h3><span className="room-badge">{!vehicle.cycle?'NO SEALANT RECORDED':progress.value<100?'SEALANT ACTIVE':'MAINTENANCE DUE'}</span></div>{vehicle.cycle&&<><div className="room-progress" role="progressbar" aria-label="Sealant period used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.value)}><span style={{width:`${progress.value}%`}}/></div><p>{progress.label}</p><small>Applied {date(vehicle.cycle.applied_on)} · Estimated end {date(vehicle.cycle.sealant_expires_at)}</small></>}<dl className="room-protections">{[['Ceramic coating','ceramic_coating'],['Leather protection','leather_protection'],['Fabric protection','fabric_protection']].map(([label,key])=><div key={key}><dt>{label}</dt><dd>{services.some(s=>s[key])?'Application recorded':'Not recorded'}</dd></div>)}</dl></section><section className="room-section"><h3>Service history</h3>{services.length?<ul className="room-history">{services.map(s=><li key={s.id}><time>{date(s.service_date)}</time><strong>{s.title}</strong>{s.description&&<p>{s.description}</p>}</li>)}</ul>:<p className="room-muted">Your completed details will appear here.</p>}</section><section className="room-section"><div className="room-section-heading"><h3>Your photos</h3><span className="room-muted">{photos.length}</span></div>{photos.length?<div className="room-gallery">{photos.filter(p=>p.url).map(p=><button type="button" key={p.id} onClick={()=>onPhoto(p)} aria-label={`Open ${p.caption||p.photo_kind||'vehicle photo'}`}><img src={p.url} alt={p.caption||'Your vehicle'} loading="lazy"/><span>{p.caption||p.photo_kind}</span></button>)}</div>:<p className="room-muted">No photos yet. Your empty showroom is ready.</p>}</section></>;
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
  const title={services:'A little VVM love.',garage:'My Garage.',bookings:'Your next fresh start.',profile:'Your space.',offer:'Something special.'}[view];
  const interior=vehicle?.photos.filter(p=>p.url&&isInterior(p))||[];
  return <main className="garage-shell client-showroom">
    <img className="showroom-room" src="/assets/garage/showroom.webp" alt="Pink detailing showroom with white ceiling lights and a glossy tiled floor" fetchPriority="high"/>
    <header className="room-header"><a className="room-brand" href="/" aria-label="VVM Details website"><img src="/assets/logo.jpg" alt=""/><span>VVM DETAILS<small>{data?.preview?'CLIENT PREVIEW':firstName?`${firstName}’s Garage`:'Your private Garage'}</small></span></a>{data?.preview&&<a className="room-preview-back" href="/garage-admin">Back to admin</a>}</header>
    <button className={`room-special${view==='offer'?' is-active':''}`} type="button" onClick={()=>navigate('offer')}><GarageIcon name="gift"/><span>Special Offer</span><GarageIcon name="arrow"/></button>
    {loading?<p className="room-loading" role="status">Opening your Garage…</p>:!data?<section className="room-auth-error"><h1>Your Garage awaits.</h1><p role="alert">{error||'Please sign in to open your Garage.'}</p><a className="room-primary" href="/client-login">ENTER MY GARAGE <GarageIcon name="arrow"/></a></section>:<>
      {error&&<p className="room-refresh-error" role="status">Couldn’t refresh your Garage. {error}</p>}
      {view==='home'&&<section className="room-home" aria-label="Your vehicle showroom">
        {hero?.url&&!imageFailed?<button className={`showroom-car${hero.is_cutout||legacyCutout?' is-cutout':' is-photo'}`} type="button" onClick={()=>navigate('garage')} aria-label={`View ${vehicleLabel(vehicle)} details`}><img src={hero.url} alt={vehicleLabel(vehicle)} crossOrigin="anonymous" onLoad={e=>{if(hero.is_cutout)return;try{const c=document.createElement('canvas');c.width=64;c.height=64;const ctx=c.getContext('2d');ctx.drawImage(e.currentTarget,0,0,64,64);const pixels=ctx.getImageData(0,0,64,64).data;for(let i=3;i<pixels.length;i+=4)if(pixels[i]<32){setLegacyCutout(true);break}}catch{}}} onError={()=>setImageFailed(true)}/></button>:<div className="room-awaiting"><span className="room-label">YOUR SPACE. YOUR RIDE.</span><h1>{firstName?`Welcome, ${firstName}.`:'Welcome to your Garage.'}</h1><p>{(imageFailed||(hero&&!hero.url))?'Your photo is temporarily unavailable. Please reopen your Garage.':vehicle?'Your showroom is ready for your vehicle photo.':'Your showroom is ready. Your vehicle will appear here once added.'}</p></div>}
        <div className="room-vehicle-plate">{data.vehicles.length>1?<label htmlFor="showroom-vehicle">YOUR VEHICLE<select id="showroom-vehicle" value={selected} onChange={e=>setSelected(e.target.value)}>{data.vehicles.map(v=><option key={v.id} value={v.id}>{vehicleLabel(v)}</option>)}</select></label>:vehicle?<><span className="room-label">YOUR VEHICLE</span><strong>{vehicleLabel(vehicle)}</strong></>:<><span className="room-label">A LITTLE LOVE. EVERY DETAIL.</span><strong>Your story starts here.</strong></>}{vehicle&&<button className="room-plate-action" type="button" onClick={()=>navigate('garage')} aria-label="View protection and care history"><GarageIcon name="shield"/></button>}</div>
        {interior.length>0&&<button type="button" className="room-interior" onClick={()=>{navigate('garage');setPhoto(interior[0])}}><GarageIcon name="photo"/> View interior</button>}
      </section>}
      {view!=='home'&&<section className="client-sheet" aria-labelledby="room-panel-title"><div className="room-sheet-head"><div><p className="room-label">{firstName?`${firstName.toUpperCase()}’S GARAGE`:'VVM DETAILS'}</p><h1 id="room-panel-title" tabIndex="-1" ref={heading}>{title}</h1></div><button className="room-close" onClick={()=>navigate('home')} aria-label="Return to showroom"><GarageIcon name="close"/></button></div>
        {data.vehicles.length>1&&['garage','bookings','offer'].includes(view)&&<label className="room-sheet-vehicle">Vehicle<select aria-label="Select vehicle" value={selected} onChange={e=>setSelected(e.target.value)}>{data.vehicles.map(v=><option key={v.id} value={v.id}>{vehicleLabel(v)}</option>)}</select></label>}
        {view==='services'&&<Services/>}
        {view==='garage'&&<VehicleDetails vehicle={vehicle} onPhoto={setPhoto}/>}
        {view==='offer'&&<Offer vehicle={vehicle}/>}
        {view==='bookings'&&<><p className="room-lede">{vehicle?`Visits for ${vehicleLabel(vehicle)}.`:'Your next detail starts here.'}</p>{vehicle?.appointments.length?<ul className="room-bookings">{vehicle.appointments.map(a=><li key={a.id}><GarageIcon name="bookings"/><div><span className="room-badge">{a.status==='requested'?'REQUESTED':'CONFIRMED'}</span><h3>{a.service_label}</h3><strong>{date(a.starts_at)}</strong><p>{time(a.starts_at)}</p></div></li>)}</ul>:<div className="room-empty"><GarageIcon name="bookings"/><h3>Room for a fresh start.</h3><p>No upcoming appointments recorded for {vehicle?'this vehicle':'your account'}.</p></div>}<a className="room-primary" href="/#book">BOOK MY DAY <GarageIcon name="arrow"/></a><p className="room-small">Need to change a visit? <a href="sms:+12406019451">Text the VVM team</a>.</p></>}
        {view==='profile'&&<><p className="room-lede">A little care, all in one place.</p><dl className="room-profile"><div><dt>Name</dt><dd>{data.profile?.display_name||'VVM client'}</dd></div><div><dt>Email</dt><dd>{data.profile?.email||'Not available'}</dd></div><div><dt>Vehicles</dt><dd>{data.vehicles.length}</dd></div></dl><div className="room-profile-actions">{!data.preview&&<a className="room-primary" href="/reset-password">CHANGE PASSWORD <GarageIcon name="arrow"/></a>}<a className="room-secondary" href="mailto:vvm.detailing@gmail.com">CONTACT VVM DETAILS</a>{data.preview?<a className="room-secondary" href="/garage-admin">RETURN TO ADMIN</a>:<button className="room-secondary" onClick={signOut}>SIGN OUT</button>}</div></>}
      </section>}
    </>}
    {data&&<nav className="room-nav" aria-label="Garage navigation">{tabs.map(([id,label])=><button key={id} type="button" className={view===id?'is-active':''} aria-pressed={view===id} onClick={()=>navigate(id)}><GarageIcon name={id}/><span>{label}</span></button>)}</nav>}
    <dialog className="room-photo-dialog" ref={dialog} onCancel={e=>{e.preventDefault();setPhoto(null)}} onClick={e=>{if(e.target===e.currentTarget)setPhoto(null)}} aria-label="Vehicle photo">{photo&&<><button className="room-close" onClick={()=>setPhoto(null)} aria-label="Close photo"><GarageIcon name="close"/></button><img src={photo.url} alt={photo.caption||'Your vehicle'}/><p>{photo.caption||photo.photo_kind}</p></>}</dialog>
  </main>;
}
