'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { garageRequest, signOut } from './garage-auth-client';
import GaragePhotoEditor from './garage-photo-editor';
import { prepareGaragePhoto } from './garage-image';
import { vehicleLabel } from '../server/garage-vehicle';
import { mergeAdminSnapshot, mergeSavedPhoto } from '../server/garage-admin-state';

const today = () => new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'});
function easternDateTime(date, time) {
  const [y,m,d]=date.split('-').map(Number),[hh,mm]=time.split(':').map(Number);
  const target=Date.UTC(y,m-1,d,hh,mm), parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',hourCycle:'h23'}).formatToParts(new Date(target)).map(p=>[p.type,p.value]));
  const asUtc=Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute);
  const result=new Date(target-(asUtc-target));
  const check=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(result).map(p=>[p.type,p.value]));
  if(+check.year!==y||+check.month!==m||+check.day!==d||+check.hour!==hh||+check.minute!==mm)throw new Error('That local appointment time does not exist because of the daylight saving time change.');
  return result.toISOString();
}

const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const easternDay = iso => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

// Clients by name, then each vehicle's dates (services and photos) so photos are easy to find by date
function ClientDashboard({ customers, onAddPhoto, busy, vehiclesLoaded }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => customers.filter(c => `${c.display_name || ''} ${c.email || ''}`.toLowerCase().includes(q.trim().toLowerCase())), [customers, q]);
  return <section className="g-panel admin-dash"><p className="g-eyebrow">DASHBOARD</p><h2>Clients</h2>
    <input className="dash-search" placeholder="Search by name or email" value={q} onChange={e => setQ(e.target.value)} aria-label="Search clients"/>
    {list.length === 0 && <p className="g-muted">{q.trim() ? 'No matching clients.' : 'No clients yet.'}</p>}
    {list.map(c => <article className="dash-client" key={c.user_id}>
      <h3>{c.display_name || c.email}</h3><a className="room-link" href={`/garage?client=${encodeURIComponent(c.user_id)}`}>Preview client Garage →</a><p className="g-muted">{c.email}</p>
      {(c.garage_vehicles || []).length === 0 && <p className="g-muted">{vehiclesLoaded?'No vehicles yet.':'Vehicle list unavailable. Refresh to try again.'}</p>}
      {(c.garage_vehicles || []).map(v => {
        const days = {};
        (v.garage_services || []).forEach(s => { (days[s.service_date] = days[s.service_date] || { services: [], photos: [] }).services.push(s.title); });
        (v.garage_photos || []).forEach(p => { const d = easternDay(p.created_at); (days[d] = days[d] || { services: [], photos: [] }).photos.push(p); });
        const keys = Object.keys(days).sort().reverse();
        return <div className="dash-vehicle" key={v.id}>
          <div className="dash-vhead"><b>{vehicleLabel(v)}</b><button type="button" className="g-text-button" disabled={busy} onClick={() => onAddPhoto(c.user_id, v.id)}>+ ADD PHOTOS</button></div>
          {keys.length === 0 && <p className="g-muted">No services or photos yet.</p>}
          {keys.map(d => <div className="dash-day" key={d}>
            <p className="dash-date">{fmtDate(d)}<span>{days[d].services.join(' · ')}</span></p>
            {days[d].photos.length > 0 && <div className="dash-photos">{days[d].photos.map(p => p.url ? <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer"><img src={p.url} alt={p.caption || 'Vehicle photo'} loading="lazy"/></a> : null)}</div>}
          </div>)}
        </div>;
      })}
    </article>)}
    <p className="g-muted small">Photo dates are the day each photo was added.</p>
  </section>;
}


export default function GarageAdmin() {
  const [customers,setCustomers]=useState([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const [email,setEmail]=useState(''),[name,setName]=useState(''),[password,setPassword]=useState('');
  const [customer,setCustomer]=useState(''),[year,setYear]=useState(''),[make,setMake]=useState(''),[model,setModel]=useState(''),[color,setColor]=useState('');
  const [vehicle,setVehicle]=useState(''),[serviceDate,setServiceDate]=useState(today()),[title,setTitle]=useState('Full Factory Reset'),[description,setDescription]=useState('');
  const [sealant,setSealant]=useState(false),[coating,setCoating]=useState(false),[leather,setLeather]=useState(false),[fabric,setFabric]=useState(false);
  const [photo,setPhoto]=useState(null),[photoKind,setPhotoKind]=useState('hero'),[caption,setCaption]=useState(''),[isHero,setIsHero]=useState(true),[autoShowroom,setAutoShowroom]=useState(false),[removalAvailable,setRemovalAvailable]=useState(false),[preview,setPreview]=useState('');
  const [apptDate,setApptDate]=useState(''),[apptTime,setApptTime]=useState(''),[apptService,setApptService]=useState('Full Factory Reset'),[apptStatus,setApptStatus]=useState('confirmed');
  const [query,setQuery]=useState(''),[creatingClient,setCreatingClient]=useState(false),[creatingVehicle,setCreatingVehicle]=useState(false);
  const fileInput=useRef(null),actionLock=useRef(false);
  const [selectionReady,setSelectionReady]=useState(false),[vehiclesLoaded,setVehiclesLoaded]=useState(false);
  const sortedCustomers=useMemo(()=>[...customers].sort((a,b)=>(a.display_name||a.email).localeCompare(b.display_name||b.email)),[customers]);
  const client=customers.find(c=>c.user_id===customer);
  const vehicles=client?.garage_vehicles||[];
  const selectedVehicle=vehicles.find(v=>v.id===vehicle);
  const matches=sortedCustomers.filter(c=>`${c.display_name||''} ${c.email||''}`.toLowerCase().includes(query.trim().toLowerCase()));
  useEffect(()=>{const params=new URLSearchParams(window.location.search);setCustomer(params.get('client')||'');setVehicle(params.get('vehicle')||'');setSelectionReady(true);load()},[]);
  useEffect(()=>{if(!selectionReady)return;const url=new URL(window.location.href);if(customer)url.searchParams.set('client',customer);else url.searchParams.delete('client');if(vehicle)url.searchParams.set('vehicle',vehicle);else url.searchParams.delete('vehicle');window.history.replaceState(null,'',url)},[customer,vehicle,selectionReady]);
  useEffect(()=>{if(!photo){setPreview('');return}const url=URL.createObjectURL(photo);setPreview(url);return()=>URL.revokeObjectURL(url)},[photo]);
  function clearVehicleDrafts(){
    setPhoto(null);setCaption('');setPhotoKind('hero');setIsHero(true);if(fileInput.current)fileInput.current.value='';
    setDescription('');setServiceDate(today());setTitle('Full Factory Reset');setSealant(false);setCoating(false);setLeather(false);setFabric(false);
    setApptDate('');setApptTime('');setApptService('Full Factory Reset');setApptStatus('confirmed');
  }
  function selectClient(id){if(actionLock.current)return;setCustomer(id);setVehicle('');setCreatingClient(false);setCreatingVehicle(false);setNotice('');setError('');setYear('');setMake('');setModel('');setColor('');clearVehicleDrafts()}
  function selectVehicle(id){if(actionLock.current)return;setVehicle(id);setCreatingVehicle(false);setNotice('');setError('');clearVehicleDrafts()}
  async function load(){
    try{const d=await garageRequest('/api/garage/admin',{cache:'no-store'});setCustomers(previous=>mergeAdminSnapshot(previous,d));setVehiclesLoaded(d.read_status?.vehicles!==false);setRemovalAvailable(!!d.showroom?.background_removal_available);if(d.warning)setError(d.warning)}
    catch(e){setError(e.message)}finally{setLoading(false)}
  }
  async function action(body,success){
    if(actionLock.current)return null;actionLock.current=true;setBusy(true);setError('');setNotice('');
    try{const d=await garageRequest('/api/garage/admin',{method:'POST',body:JSON.stringify(body)});setNotice(d.message||success||'Saved.');if(body.action==='set_hero')setCustomers(list=>list.map(c=>({...c,garage_vehicles:(c.garage_vehicles||[]).map(v=>v.id===d.vehicle_id?{...v,hero_photo_id:d.hero_photo_id}:v)})));if(!['create_customer','create_vehicle'].includes(body.action))await load();return d}
    catch(e){setError(e.message);return null}finally{actionLock.current=false;setBusy(false)}
  }
  async function addCustomer(e){
    e.preventDefault();const d=await action({action:'create_customer',email:email.trim(),display_name:name.trim(),password});
    if(d){setCustomers(list=>{const existing=list.find(c=>c.user_id===d.customer_id);return [{...d.customer,garage_vehicles:existing?.garage_vehicles||d.customer.garage_vehicles||[]},...list.filter(c=>c.user_id!==d.customer_id)]});setCustomer(d.customer_id);setVehicle('');clearVehicleDrafts();setCreatingClient(false);setCreatingVehicle(false);setEmail('');setName('');setPassword('');setQuery('');setYear('');setMake('');setModel('');setColor('')}
  }
  async function addVehicle(e){
    e.preventDefault();if(!client||!vehiclesLoaded)return;const d=await action({action:'create_vehicle',customer_id:customer,year,make,model,color},'Vehicle added and selected. You’re ready to add photos.');
    if(d){setCustomers(list=>list.map(c=>c.user_id===customer?{...c,garage_vehicles:[...(c.garage_vehicles||[]),{...d.vehicle,garage_services:[],garage_photos:[]}]}:c));setVehicle(d.vehicle.id);clearVehicleDrafts();setCreatingVehicle(false);setYear('');setMake('');setModel('');setColor('')}
  }
  async function addService(e){e.preventDefault();if(!selectedVehicle)return;const d=await action({action:'record_service',vehicle_id:vehicle,service_date:serviceDate,title,description,paint_sealant:sealant,ceramic_coating:coating,leather_protection:leather,fabric_protection:fabric},'Completed detail saved.');if(d){setDescription('');setSealant(false);setCoating(false);setLeather(false);setFabric(false)}}
  async function choosePhoto(file){
    if(actionLock.current)return;setPhoto(null);setError('');setNotice('');if(!file)return;
    actionLock.current=true;setBusy(true);setNotice('Preparing your photo…');
    try{const blob=await prepareGaragePhoto(file);setPhoto(new File([blob],file.name.replace(/\.[^.]+$/,'')+(blob.type==='image/webp'?'.webp':'.jpg'),{type:blob.type}));setNotice('Photo prepared. Tap SAVE PHOTO below to save it to this vehicle.');}
    catch(err){setNotice('');setError(err.message);if(fileInput.current)fileInput.current.value='';}
    finally{actionLock.current=false;setBusy(false)}
  }
  async function upload(e){
    e.preventDefault();if(actionLock.current||!photo||!selectedVehicle)return;actionLock.current=true;setBusy(true);setError('');setNotice('');
    try{const blob=photo;const form=new FormData();form.append('vehicle_id',vehicle);form.append('kind',photoKind);form.append('caption',caption);form.append('is_hero',String(isHero));form.append('showroom',String(isHero&&autoShowroom));form.append('file',blob,blob.name);const result=await garageRequest('/api/garage/photo',{method:'POST',body:form});setCustomers(list=>mergeSavedPhoto(list,result));setNotice(`Photo saved to ${client.display_name||client.email} · ${vehicleLabel(selectedVehicle)}.${result.warning?' '+result.warning:''}`);setPhoto(null);setCaption('');if(fileInput.current)fileInput.current.value='';await load()}
    catch(err){setError(err.message)}finally{actionLock.current=false;setBusy(false)}
  }
  async function addAppointment(e){e.preventDefault();if(!selectedVehicle||!apptDate||!apptTime)return;try{const d=await action({action:'appointment',vehicle_id:vehicle,starts_at:easternDateTime(apptDate,apptTime),service_label:apptService,status:apptStatus},'Appointment saved.');if(d){setApptDate('');setApptTime('')}}catch(err){setError(err.message)}}
  function dashboardPhoto(clientId,vehicleId){selectClient(clientId);setVehicle(vehicleId);requestAnimationFrame(()=>document.getElementById('admin-upload')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'}))}
  return <main className="garage-shell admin-shell">
    <header className="garage-top"><a className="garage-brand" href="/"><img src="/assets/logo.jpg" alt=""/> VVM DETAILS <span className="admin-pill">ADMIN</span></a><div className="garage-account"><a href="/garage">CUSTOMER VIEW</a><button className="g-text-button" disabled={busy} onClick={signOut}>SIGN OUT</button></div></header>
    <div className="garage-heading"><div><p className="g-eyebrow">A LITTLE CARE. ALL IN ORDER.</p><h1>The Garage.</h1><p className="g-muted">Client. Vehicle. Photos. You’re in control.</p></div><span className="admin-count">{loading?'Loading clients…':`${customers.length} client${customers.length===1?'':'s'}`}</span></div>
    <ol className="admin-steps" aria-label="Garage setup"><li className={client?'is-complete':'is-current'}><b>{client?'✓':'01'}</b> Client</li><li className={selectedVehicle?'is-complete':client?'is-current':''}><b>{selectedVehicle?'✓':'02'}</b> Vehicle</li><li className={selectedVehicle?'is-current':''}><b>03</b> Photos</li><li><b>04</b> Optional details</li></ol>
    <div className="admin-feedback" aria-live="polite">{error&&<p className="g-alert" role="alert">{error}{/sign in/i.test(error)&&<> <a href="/admin">Sign in as admin</a></>} <button type="button" className="g-text-button" disabled={busy||loading} onClick={()=>{setError('');setLoading(true);load()}}>REFRESH</button></p>}{notice&&<p className="g-notice" role="status"><button type="button" className="g-text-button admin-dismiss" aria-label="Dismiss notification" onClick={()=>setNotice('')}>×</button>{notice}</p>}</div>
    <fieldset className="admin-workspace" disabled={busy||loading} aria-busy={busy||loading}>
      <section className="g-panel admin-step" aria-labelledby="client-step">
        <div className="admin-section-head"><div><p className="g-eyebrow">01 / START HERE</p><h2 id="client-step">Choose your client.</h2></div><button type="button" className="g-button admin-add" aria-expanded={creatingClient} onClick={()=>setCreatingClient(v=>!v)}>{creatingClient?'CANCEL':'+ NEW CLIENT'}</button></div>
        <div className="g-form"><label>Find a client<input type="search" placeholder="Search by name or email" value={query} onChange={e=>setQuery(e.target.value)}/></label><label htmlFor="admin-client">Client name</label><select id="admin-client" value={customer} onChange={e=>selectClient(e.target.value)}><option value="">Select a client</option>{[...new Map([...matches,...(client?[client]:[])].map(c=>[c.user_id,c])).values()].map(c=><option key={c.user_id} value={c.user_id}>{c.display_name||c.email}{c.display_name?` · ${c.email}`:''}</option>)}</select></div>
        {!loading&&!matches.length&&<p className="g-inline-help">{customers.length?'No clients match your search. Try another name or create a client.':'Your first client starts here. Choose + New client to create their login.'}</p>}
        {client&&<a className="g-button admin-preview-link" href={`/garage?client=${encodeURIComponent(client.user_id)}`}>OPEN CLIENT GARAGE →</a>}{client&&<p className="admin-selection"><span aria-hidden="true">✓</span><strong>{client.display_name||client.email}</strong><span>{client.email}</span></p>}
        {creatingClient&&<form className="g-form admin-inline-form" onSubmit={addCustomer}><h3>Meet your new client.</h3><div className="g-form-row"><label>Client name<input value={name} onChange={e=>setName(e.target.value)} autoComplete="name" required maxLength={120}/></label><label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required maxLength={200}/></label></div><label>Temporary password<input type="password" autoComplete="new-password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} required/></label><p className="g-inline-help">At least 8 characters. Share the login privately; your client can choose their own password using Forgot password.</p><button className="g-button">{busy?'CREATING…':'CREATE & SELECT CLIENT'}</button></form>}
      </section>
      <section className={`g-panel admin-step${!client?' admin-locked':''}`} aria-labelledby="vehicle-step">
        <div className="admin-section-head"><div><p className="g-eyebrow">02 / THEIR RIDE</p><h2 id="vehicle-step">Choose a vehicle.</h2></div>{client&&<button type="button" className="g-button admin-add" disabled={!vehiclesLoaded} aria-expanded={creatingVehicle} onClick={()=>setCreatingVehicle(v=>!v)}>{creatingVehicle?'CANCEL':'+ ADD VEHICLE'}</button>}</div>
        {!client?<p className="g-muted">Select a client above to see their vehicles.</p>:<><div className="g-form"><label htmlFor="admin-vehicle">Vehicle for {client.display_name||client.email}</label><select id="admin-vehicle" value={vehicle} onChange={e=>selectVehicle(e.target.value)}><option value="">Select their vehicle</option>{vehicles.map(v=><option key={v.id} value={v.id}>{vehicleLabel(v)}</option>)}</select></div>{!vehiclesLoaded&&<p className="g-inline-help">Vehicle list could not refresh. Refresh above before adding another vehicle.</p>}{vehiclesLoaded&&!vehicles.length&&<p className="g-inline-help">No vehicles yet. Add their first one below.</p>}
        {vehiclesLoaded&&(creatingVehicle||!vehicles.length)&&<form className="g-form admin-inline-form" onSubmit={addVehicle}><h3>Add their vehicle.</h3><p className="g-inline-help">Just the model is required. Leave year and make blank if you’re unsure.</p><div className="g-form-row"><label>Year <span className="admin-optional">Optional</span><input type="number" min="1900" max={new Date().getFullYear()+1} step="1" placeholder="2024" value={year} onChange={e=>setYear(e.target.value)}/></label><label>Make <span className="admin-optional">Optional</span><input placeholder="Lexus" value={make} onChange={e=>setMake(e.target.value)} maxLength={80}/></label></div><div className="g-form-row"><label>Model<input placeholder="IS 350" value={model} onChange={e=>setModel(e.target.value)} required maxLength={100}/></label><label>Color <span className="admin-optional">Optional</span><input value={color} onChange={e=>setColor(e.target.value)} maxLength={60}/></label></div><button className="g-button">{busy?'SAVING…':'ADD & SELECT VEHICLE'}</button></form>}
        {selectedVehicle&&<p className="admin-selection"><span aria-hidden="true">✓</span><strong>{vehicleLabel(selectedVehicle)}</strong><span>Selected for {client.display_name||client.email}</span></p>}</>}
      </section>
      <section id="admin-upload" className={`g-panel admin-step${!selectedVehicle?' admin-locked':''}`} aria-labelledby="photo-step">
        <p className="g-eyebrow">03 / MAKE IT THEIRS</p><h2 id="photo-step">Bring on the photos.</h2>
        {!selectedVehicle?<p className="g-muted">Choose a vehicle above to add its photos.</p>:<><p className="admin-context">{client.display_name||client.email}<span aria-hidden="true"> / </span><strong>{vehicleLabel(selectedVehicle)}</strong></p><form className="g-form admin-photo-form" onSubmit={upload}><label className="admin-dropzone">{preview?<img className="admin-photo-preview" src={preview} alt="Selected upload preview"/>:<span className="admin-upload-icon" aria-hidden="true">+</span>}<strong>{photo?photo.name:'Choose a vehicle photo'}</strong><span>JPEG, PNG, WebP or HEIC · up to 20 MB</span><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={e=>choosePhoto(e.target.files?.[0]||null)} required/></label><div className="g-form-row"><label>Photo type<select value={photoKind} onChange={e=>setPhotoKind(e.target.value)}><option value="hero">Cover</option><option value="before">Before</option><option value="after">After</option><option value="gallery">Gallery</option></select></label><label>Caption <span className="admin-optional">Optional</span><input value={caption} onChange={e=>setCaption(e.target.value)} maxLength={160} placeholder="Fresh from a little VVM love"/></label></div><label className="g-check"><input type="checkbox" checked={isHero} onChange={e=>setIsHero(e.target.checked)}/> Use as their Garage cover</label>{isHero&&<><label className="g-check"><input type="checkbox" checked={autoShowroom} onChange={e=>setAutoShowroom(e.target.checked)} disabled={!removalAvailable}/> Automatically remove the background for the showroom</label><p className="g-inline-help">{removalAvailable?'Uses your remove.bg credits. Transparent cutouts skip removal automatically.':'Upload a transparent PNG/WebP to place the car directly in the showroom. Automatic removal needs your remove.bg connection.'}</p></>}<button className="g-button admin-save" disabled={!photo||busy}>{busy?'SAVING…':'SAVE PHOTO'}</button><p className="g-inline-help">No editing needed. We automatically resize, compress and convert photos to WebP, and remove embedded location data.</p></form>
        {!!selectedVehicle.garage_photos?.length&&<div className="admin-saved-photos"><h3>Saved photos <span>({selectedVehicle.garage_photos.length})</span></h3><div className="dash-photos">{selectedVehicle.garage_photos.map(p=><div key={p.id} className="admin-saved-photo">{p.url?<a href={p.url} target="_blank" rel="noopener noreferrer"><img src={p.url} alt={p.caption||'Saved vehicle photo'} loading="lazy"/></a>:<p className="g-inline-help">Photo saved. Preview unavailable.</p>}<button type="button" className="g-text-button" disabled={busy||selectedVehicle.hero_photo_id===p.id} onClick={()=>action({action:'set_hero',photo_id:p.id},'Garage cover saved.')}>{selectedVehicle.hero_photo_id===p.id?'✓ GARAGE COVER':'USE AS COVER'}</button></div>)}</div></div>}
        </>}
      </section>
      <section className="admin-extras" aria-labelledby="optional-step"><p className="g-eyebrow">04 / WHEN YOU NEED IT</p><h2 id="optional-step">The extra details.</h2><p className="g-muted">All optional. Add what matters, whenever you’re ready.</p>
        {!selectedVehicle?<p className="g-inline-help">Choose a vehicle to add service history, appointments or a showroom cover.</p>:<div key={vehicle} className="admin-details-list">
          <details className="g-panel admin-disclosure"><summary><span>Completed detail & protection<small>Service history, notes and protection applied</small></span><b aria-hidden="true">+</b></summary><form className="g-form" onSubmit={addService}><p className="admin-context">For {vehicleLabel(selectedVehicle)}</p><div className="g-form-row"><label>Completed on<input type="date" max={today()} value={serviceDate} onChange={e=>setServiceDate(e.target.value)} required/></label><label>Service name<input value={title} onChange={e=>setTitle(e.target.value)} required maxLength={140}/></label></div><label>Notes <span className="admin-optional">Optional</span><textarea value={description} onChange={e=>setDescription(e.target.value)} rows="3" maxLength={1500}/></label><div className="g-check-grid"><label><input type="checkbox" checked={sealant} onChange={e=>setSealant(e.target.checked)}/> Paint Ceramic Sealant Applied</label><label><input type="checkbox" checked={coating} onChange={e=>setCoating(e.target.checked)}/> True Ceramic Coating Applied</label><label><input type="checkbox" checked={leather} onChange={e=>setLeather(e.target.checked)}/> Leather Protection Applied</label><label><input type="checkbox" checked={fabric} onChange={e=>setFabric(e.target.checked)}/> Fabric Protection Applied</label></div>{sealant&&<p className="g-inline-help">Starts a new 3-month maintenance cycle, replaces the previous offer and schedules maintenance reminders.</p>}<button className="g-button">SAVE COMPLETED DETAIL</button></form></details>
          <details className="g-panel admin-disclosure"><summary><span>Appointment<small>Add a requested or confirmed visit</small></span><b aria-hidden="true">+</b></summary><form className="g-form" onSubmit={addAppointment}><p className="admin-context">For {vehicleLabel(selectedVehicle)}</p><div className="g-form-row"><label>Date (Eastern)<input type="date" value={apptDate} onChange={e=>setApptDate(e.target.value)} required/></label><label>Time (Eastern)<input type="time" value={apptTime} onChange={e=>setApptTime(e.target.value)} required/></label></div><label>Service<input value={apptService} onChange={e=>setApptService(e.target.value)} required maxLength={140}/></label><label>Status<select value={apptStatus} onChange={e=>setApptStatus(e.target.value)}><option value="confirmed">Confirmed</option><option value="requested">Requested</option></select></label><button className="g-button">SAVE APPOINTMENT</button></form></details>
          <details className="g-panel admin-disclosure"><summary><span>Showroom photo studio<small>Prepare and approve a styled cover</small></span><b aria-hidden="true">+</b></summary><GaragePhotoEditor vehicles={[selectedVehicle]} selectedVehicleId={vehicle} onBusyChange={value=>{actionLock.current=value;setBusy(value)}} onSaved={async result=>{setCustomers(list=>mergeSavedPhoto(list,result));await load()}}/></details>
        </div>}
      </section>
    </fieldset>
    <details className="g-panel admin-disclosure admin-directory"><summary><span>Client directory & history<small>Browse every client, vehicle and photo by date</small></span><b aria-hidden="true">+</b></summary>{loading?<p className="g-muted">Loading clients…</p>:<ClientDashboard customers={sortedCustomers} busy={busy} vehiclesLoaded={vehiclesLoaded} onAddPhoto={dashboardPhoto}/>}</details>
    <footer className="g-footer"><span>A little love. Every detail.</span><a href="/">Back to VVM Details →</a></footer>
  </main>;
}
