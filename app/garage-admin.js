'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { garageRequest, signOut } from './garage-auth-client';
import { prepareGaragePhoto } from './garage-image';
import { vehicleLabel, preferredGarageVehicleId } from '../server/garage-vehicle';
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


// Health + protection settings: what the client sees on their Health tab and My Garage
function VehicleStatus({ vehicle, busy, onSave }) {
  const [f,setF]=useState(()=>({vehicle_size:vehicle.vehicle_size||'',protection_type:vehicle.protection_type||'',ceramic_years:vehicle.ceramic_years||5,headlights_done:!!vehicle.headlights_done,paint_correction:!!vehicle.paint_correction,recommend_ceramic:!!vehicle.recommend_ceramic,show_headlights:vehicle.show_headlights!==false,show_paint:vehicle.show_paint!==false,show_protection:vehicle.show_protection!==false,show_ceramic_rec:vehicle.show_ceramic_rec!==false}));
  const box=(k,label)=><label><input type="checkbox" checked={f[k]} onChange={e=>setF({...f,[k]:e.target.checked})}/> {label}</label>;
  const radio=(v,label)=><label><input type="radio" name="protection" checked={f.protection_type===v} onChange={()=>setF({...f,protection_type:v})}/> {label}</label>;
  return <form className="g-form admin-status" onSubmit={e=>{e.preventDefault();onSave({...f,vehicle_size:f.vehicle_size||null,protection_type:f.protection_type||null,ceramic_years:Number(f.ceramic_years)})}}>
    <p className="g-inline-help">Anything not ticked as done shows a red X on the client’s Health tab.</p>
    <label>Membership reset size (client gets half off this size)<select value={f.vehicle_size} onChange={e=>setF({...f,vehicle_size:e.target.value})}><option value="">Not set</option><option value="coupe">Coupe · $265 → $133</option><option value="sedan">Sedan · $295 → $148</option><option value="suv">SUV · $320 → $160</option><option value="truck">Truck · $345 → $173</option><option value="minivan">Mini-van · $410 → $205</option></select></label>
    <fieldset className="admin-status-group"><legend>Protection · pick one</legend><div className="g-check-grid">{radio('','None')}{radio('sealant','Ceramic Sealant · 3 months')}{radio('coating','Ceramic Coating · years')}</div>{f.protection_type==='coating'&&<label>Ceramic coating lasts (years)<input type="number" min="1" max="15" value={f.ceramic_years} onChange={e=>setF({...f,ceramic_years:e.target.value})}/></label>}</fieldset>
    <fieldset className="admin-status-group"><legend>Done</legend><div className="g-check-grid">{box('headlights_done','Headlights done')}{box('paint_correction','Paint Correction done')}</div></fieldset>
    <fieldset className="admin-status-group"><legend>Recommend</legend><div className="g-check-grid">{box('recommend_ceramic','Recommend Ceramic Coating')}</div></fieldset>
    <fieldset className="admin-status-group"><legend>What the client sees</legend><div className="g-check-grid">{box('show_headlights','Headlights')}{box('show_paint','Paint condition')}{box('show_protection','Protection')}{box('show_ceramic_rec','Ceramic coating recommendation')}</div></fieldset>
    <div className="admin-status-actions"><button className="g-button" disabled={busy}>SAVE</button></div>
  </form>;
}

// Runs the one-time smaller-copy job in batches until nothing is left
function SpeedUp({ onNotice, onError, onDone }) {
  const [running,setRunning]=useState(false),[left,setLeft]=useState(null);
  async function run(){
    setRunning(true);onError('');let total=0;
    try{
      for(let i=0;i<200;i++){
        const d=await garageRequest('/api/garage/admin',{method:'POST',body:JSON.stringify({action:'make_display_copies'})});
        total+=d.done;setLeft(d.remaining);
        if(d.remaining===0||d.done===0)break;
      }
      onNotice(total?`Made ${total} faster ${total===1?'copy':'copies'}.`:'Everything is already fast.');
      await onDone();
    }catch(e){onError(e.message)}finally{setRunning(false)}
  }
  return <div className="admin-speed-row"><button type="button" className="g-button" disabled={running} onClick={run}>{running?'WORKING…':'SPEED UP PHOTOS'}</button>{left!==null&&<span className="g-inline-help">{left} left to convert</span>}</div>;
}

// Client phone number, used by their Garage booking
function ClientContact({ client, busy, onSave }) {
  const [phone,setPhone]=useState(client.phone||'');
  useEffect(()=>setPhone(client.phone||''),[client.user_id,client.phone]);
  return <form className="g-form admin-status" onSubmit={e=>{e.preventDefault();onSave(phone)}}>
    <p className="g-inline-help">Their Garage booking uses this number, so the phone is filled in for them.</p>
    <label>Phone<input value={phone} onChange={e=>setPhone(e.target.value)} inputMode="tel" autoComplete="off" placeholder="(240) 555-0100"/></label>
    <div className="admin-status-actions"><button className="g-button" disabled={busy}>SAVE PHONE</button></div>
  </form>;
}

// Per-client brand logo, shown top center in their My Garage
function ClientLogo({ client, busy, onChanged, onError, onNotice }) {
  const [working,setWorking]=useState(false),input=useRef(null);
  async function choose(file){
    if(!file)return;onError('');
    if(file.size>2*1024*1024){onError('Choose a logo under 2 MB.');if(input.current)input.current.value='';return}
    setWorking(true);
    try{const form=new FormData();form.append('customer_id',client.user_id);form.append('file',file,file.name);const d=await garageRequest('/api/garage/logo',{method:'POST',body:form});onNotice(d.message||'Logo saved.');await onChanged()}
    catch(e){onError(e.message)}finally{setWorking(false);if(input.current)input.current.value=''}
  }
  async function remove(){
    if(!confirm('Remove this client’s logo?'))return;setWorking(true);
    try{const d=await garageRequest('/api/garage/admin',{method:'POST',body:JSON.stringify({action:'delete_logo',customer_id:client.user_id})});onNotice(d.message||'Logo removed.');await onChanged()}
    catch(e){onError(e.message)}finally{setWorking(false)}
  }
  return <div className="g-form admin-logo">
    <p className="g-inline-help">PNG with a clear background works best. It’s resized to 400 px tall automatically. Up to 2 MB.</p>
    {client.logo_url&&<div className="admin-logo-current"><img src={client.logo_url} alt={`${client.display_name||'Client'} logo`}/></div>}
    <label className="admin-dropzone"><strong>{working?'Saving logo…':client.has_logo?'Replace logo':'Choose logo'}</strong><span>PNG, JPG or WebP · up to 2 MB</span><input ref={input} type="file" accept="image/png,image/webp,image/jpeg" disabled={busy||working} onChange={e=>choose(e.target.files?.[0])}/></label>
    {client.has_logo&&<button type="button" className="g-text-button admin-delete" disabled={busy||working} onClick={remove}>REMOVE LOGO</button>}
  </div>;
}


// Saved photos: arrange and show/hide locally, then press Save once. Covers still change right away when you pick one.
function PhotoLayout({ vehicle, busy, action, onSave }) {
  const photos=vehicle.garage_photos||[];
  const saved=[...photos].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)).map(p=>p.id);
  const [ids,setIds]=useState(saved),[show,setShow]=useState({});
  useEffect(()=>{setIds([...photos].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)).map(p=>p.id));setShow({})},[vehicle.id,photos.map(p=>p.id+':'+p.sort_order+':'+p.show_on_garage).join('|')]);
  const byId=Object.fromEntries(photos.map(p=>[p.id,p]));
  const visible=id=>id in show?show[id]:byId[id]?.show_on_garage!==false;
  const dirty=ids.join()!==saved.join()||Object.keys(show).some(id=>show[id]!==(byId[id]?.show_on_garage!==false));
  function move(i,d){const next=[...ids];[next[i+d],next[i]]=[next[i],next[i+d]];setIds(next)}
  return <div className="admin-saved-photos"><h3>Saved photos <span>({photos.length})</span></h3>
    <p className="g-inline-help">Arrange the photos, tick the ones to show on My Garage, then press Save. Nothing changes for the client until you save.</p>
    <div className="dash-photos">{ids.map((id,i)=>{const p=byId[id];if(!p)return null;return <div key={id} className="admin-saved-photo">{p.url?<a href={p.url} target="_blank" rel="noopener noreferrer"><img src={p.url} alt={p.caption||'Saved vehicle photo'} loading="lazy"/></a>:<p className="g-inline-help">Photo saved. Preview unavailable.</p>}
      <button type="button" className="g-text-button" disabled={busy||vehicle.hero_photo_id===p.id} onClick={()=>action({action:'set_hero',photo_id:p.id,cover:'desktop'},'Desktop cover saved.')}>{vehicle.hero_photo_id===p.id?'✓ DESKTOP COVER':'USE AS DESKTOP COVER'}</button>
      <button type="button" className="g-text-button" disabled={busy||vehicle.mobile_hero_photo_id===p.id} onClick={()=>action({action:'set_hero',photo_id:p.id,cover:'mobile'},'Phone cover saved.')}>{vehicle.mobile_hero_photo_id===p.id?'✓ PHONE COVER':'USE AS PHONE COVER'}</button>
      <button type="button" className="g-text-button admin-delete" disabled={busy} onClick={()=>{if(confirm('Delete this photo for good? It will be removed from the client\'s Garage.'))action({action:'delete_photo',photo_id:p.id},'Photo deleted.')}}>DELETE PHOTO</button>
      <label className="g-check admin-show-toggle"><input type="checkbox" checked={visible(id)} disabled={busy} onChange={e=>setShow({...show,[id]:e.target.checked})}/> Show on My Garage</label>
      <div className="admin-move"><button type="button" className="g-text-button" disabled={busy||i===0} aria-label="Move photo up" onClick={()=>move(i,-1)}>▲ UP</button><button type="button" className="g-text-button" disabled={busy||i===ids.length-1} aria-label="Move photo down" onClick={()=>move(i,1)}>▼ DOWN</button></div>
    </div>;})}</div>
    <div className="admin-status-actions"><button type="button" className="g-button" disabled={busy||!dirty} onClick={()=>onSave(ids,show)}>{dirty?'SAVE PHOTO ORDER':'PHOTOS SAVED'}</button></div>
  </div>;
}

// Scaled iframe so a phone or desktop screen fits the admin page
function PreviewFrame({ src, w, h, label }) {
  const box=useRef(null),[scale,setScale]=useState(1);
  useEffect(()=>{const el=box.current;if(!el)return;const fit=()=>setScale(Math.min(1,el.clientWidth/w));fit();const ro=new ResizeObserver(fit);ro.observe(el);return()=>ro.disconnect()},[w]);
  return <div className="admin-preview-frame" ref={box}><p className="g-eyebrow">{label}</p><div className="admin-preview-screen" style={{width:w*scale,height:h*scale}}><iframe title={label} src={src} style={{width:w,height:h,transform:`scale(${scale})`}}/></div></div>;
}

// Phone and desktop size and position for the showroom cover
function ShowroomSizer({ vehicle, busy, onSave }) {
  const init=p=>({scale:vehicle[`${p}_scale`]??100,x:vehicle[`${p}_x`]??50,y:vehicle[`${p}_y`]??58});
  const [f,setF]=useState(()=>({phone:init('phone'),desktop:init('desktop')}));
  const slider=(dev,key,label,min,max)=><label>{label} <b>{f[dev][key]}</b><input type="range" min={min} max={max} value={f[dev][key]} disabled={busy} onChange={e=>setF({...f,[dev]:{...f[dev],[key]:Number(e.target.value)}})}/></label>;
  const block=(dev,title)=><fieldset className="admin-status-group"><legend>{title}</legend>{slider(dev,'scale','Size',10,300)}{slider(dev,'x','Left / right',-50,150)}{slider(dev,'y','Up / down',-50,150)}</fieldset>;
  return <form className="g-form admin-status" onSubmit={e=>{e.preventDefault();onSave({phone_scale:f.phone.scale,phone_x:f.phone.x,phone_y:f.phone.y,desktop_scale:f.desktop.scale,desktop_x:f.desktop.x,desktop_y:f.desktop.y})}}>{block('phone','Phone showroom')}{block('desktop','Desktop showroom')}<div className="admin-status-actions"><button className="g-button" disabled={busy}>SAVE SHOWROOM SIZE</button></div></form>;
}

function ClientPreview({ clientId, vehicleId, sig, vehicle, busy, onSaveSizing }) {
  const [device,setDevice]=useState('both'),[view,setView]=useState('home'),[nonce,setNonce]=useState(0);
  useEffect(()=>{const t=setTimeout(()=>setNonce(n=>n+1),400);return()=>clearTimeout(t)},[sig]);
  const src=`/garage?client=${encodeURIComponent(clientId)}&vehicle=${encodeURIComponent(vehicleId)}&view=${view}&r=${nonce}`;
  const pick=(items,value,set)=><div className="admin-segment" role="group">{items.map(([id,label])=><button key={id} type="button" className={value===id?'is-active':''} aria-pressed={value===id} onClick={()=>set(id)}>{label}</button>)}</div>;
  return <div className="admin-preview">
    <div className="admin-preview-controls">{pick([['home','Showroom'],['garage','My Garage'],['health','Health'],['bookings','Bookings']],view,setView)}{pick([['phone','Phone'],['desktop','Desktop'],['both','Both']],device,setDevice)}<button type="button" className="g-text-button" onClick={()=>setNonce(n=>n+1)}>REFRESH</button></div>
    <div className={`admin-preview-grid is-${device}`}>{device!=='desktop'&&<PreviewFrame key={`p${src}`} src={src} w={390} h={780} label="PHONE"/>}{device!=='phone'&&<PreviewFrame key={`d${src}`} src={src} w={1280} h={760} label="DESKTOP"/>}</div>
    <details className="g-panel admin-disclosure" open><summary><span>Showroom size<small>Size and position for phone and desktop, shown above</small></span><b aria-hidden="true">+</b></summary><ShowroomSizer key={vehicleId} vehicle={vehicle} busy={busy} onSave={onSaveSizing}/></details>
  </div>;
}

export default function GarageAdmin() {
  const [customers,setCustomers]=useState([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const [email,setEmail]=useState(''),[name,setName]=useState(''),[password,setPassword]=useState(''),[newPassword,setNewPassword]=useState(''),[showPassword,setShowPassword]=useState(false),[showNewPassword,setShowNewPassword]=useState(false);
  const [customer,setCustomer]=useState(''),[year,setYear]=useState(''),[make,setMake]=useState(''),[model,setModel]=useState(''),[color,setColor]=useState('');
  const [vehicle,setVehicle]=useState(''),[serviceDate,setServiceDate]=useState(today()),[title,setTitle]=useState('Full Factory Reset'),[description,setDescription]=useState('');
  const [sealant,setSealant]=useState(false),[coating,setCoating]=useState(false),[leather,setLeather]=useState(false),[fabric,setFabric]=useState(false);
  const [photo,setPhoto]=useState(null),[photoKind,setPhotoKind]=useState('hero'),[caption,setCaption]=useState(''),[isHero,setIsHero]=useState(false),[coverFor,setCoverFor]=useState('desktop'),[preview,setPreview]=useState('');
  const [apptDate,setApptDate]=useState(''),[apptTime,setApptTime]=useState(''),[apptService,setApptService]=useState('Full Factory Reset'),[apptStatus,setApptStatus]=useState('confirmed');
  const [query,setQuery]=useState(''),[creatingClient,setCreatingClient]=useState(false),[creatingVehicle,setCreatingVehicle]=useState(false);
  const fileInput=useRef(null),actionLock=useRef(false),pendingUpload=useRef(null);
  const [photoStatus,setPhotoStatus]=useState('idle');
  const [selectionReady,setSelectionReady]=useState(false),[vehiclesLoaded,setVehiclesLoaded]=useState(false);
  const sortedCustomers=useMemo(()=>[...customers].sort((a,b)=>(a.display_name||a.email).localeCompare(b.display_name||b.email)),[customers]);
  const client=customers.find(c=>c.user_id===customer);
  const vehicles=client?.garage_vehicles||[];
  const selectedVehicle=vehicles.find(v=>v.id===vehicle);
  const matches=sortedCustomers.filter(c=>`${c.display_name||''} ${c.email||''}`.toLowerCase().includes(query.trim().toLowerCase()));
  useEffect(()=>{const params=new URLSearchParams(window.location.search);setCustomer(params.get('client')||'');setVehicle(params.get('vehicle')||'');setSelectionReady(true);load()},[]);
  useEffect(()=>{if(!selectionReady)return;const url=new URL(window.location.href);if(customer)url.searchParams.set('client',customer);else url.searchParams.delete('client');if(vehicle)url.searchParams.set('vehicle',vehicle);else url.searchParams.delete('vehicle');window.history.replaceState(null,'',url)},[customer,vehicle,selectionReady]);
  useEffect(()=>{if(client&&!vehicle&&!creatingVehicle)setVehicle(preferredGarageVehicleId(client.garage_vehicles))},[client,vehicle,creatingVehicle]);
  useEffect(()=>{if(!busy&&!photo)return;const warn=e=>{e.preventDefault();e.returnValue=''};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[busy,photo]);
  useEffect(()=>{if(!photo){setPreview('');return}const url=URL.createObjectURL(photo);setPreview(url);return()=>URL.revokeObjectURL(url)},[photo]);
  function clearVehicleDrafts(){
    setPhoto(null);setPhotoStatus('idle');pendingUpload.current=null;setCaption('');setPhotoKind('hero');setIsHero(false);if(fileInput.current)fileInput.current.value='';
    setDescription('');setServiceDate(today());setTitle('Full Factory Reset');setSealant(false);setCoating(false);setLeather(false);setFabric(false);
    setApptDate('');setApptTime('');setApptService('Full Factory Reset');setApptStatus('confirmed');
  }
  function selectClient(id){if(actionLock.current)return;setCustomer(id);setVehicle(preferredGarageVehicleId(customers.find(c=>c.user_id===id)?.garage_vehicles));setCreatingClient(false);setCreatingVehicle(false);setNotice('');setError('');setYear('');setMake('');setModel('');setColor('');clearVehicleDrafts()}
  function selectVehicle(id){if(actionLock.current)return;setVehicle(id);setCreatingVehicle(false);setNotice('');setError('');clearVehicleDrafts()}
  async function load(){
    try{const d=await garageRequest('/api/garage/admin',{cache:'no-store'});setCustomers(previous=>mergeAdminSnapshot(previous,d));setVehiclesLoaded(d.read_status?.vehicles!==false);if(d.warning)setError(d.warning)}
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
  async function changePassword(e){e.preventDefault();const d=await action({action:'set_password',customer_id:customer,password:newPassword});if(d)setNewPassword('')}
  async function addVehicle(e){
    e.preventDefault();if(!client||!vehiclesLoaded)return;const d=await action({action:'create_vehicle',customer_id:customer,year,make,model,color},'Vehicle added and selected. You’re ready to add photos.');
    if(d){setCustomers(list=>list.map(c=>c.user_id===customer?{...c,garage_vehicles:[...(c.garage_vehicles||[]),{...d.vehicle,garage_services:[],garage_photos:[]}]}:c));setVehicle(d.vehicle.id);clearVehicleDrafts();setCreatingVehicle(false);setYear('');setMake('');setModel('');setColor('')}
  }
  async function addService(e){e.preventDefault();if(!selectedVehicle)return;const d=await action({action:'record_service',vehicle_id:vehicle,service_date:serviceDate,title,description,paint_sealant:sealant,ceramic_coating:coating,leather_protection:leather,fabric_protection:fabric},'Completed detail saved.');if(d){setDescription('');setSealant(false);setCoating(false);setLeather(false);setFabric(false)}}
  async function savePreparedPhoto(upload){
    setPhotoStatus('saving');setNotice('Saving your photo…');
    const form=new FormData();form.append('vehicle_id',upload.vehicleId);form.append('upload_id',upload.id);form.append('kind',upload.kind);form.append('caption',upload.caption);form.append('is_hero',String(upload.isHero));form.append('cover_for',upload.coverFor||'desktop');form.append('showroom',String(upload.isHero&&upload.showroom));form.append('file',upload.file,upload.file.name);
    const result=await garageRequest('/api/garage/photo',{method:'POST',body:form});
    setCustomers(list=>mergeSavedPhoto(list,result));setPhotoStatus('saved');setNotice(`Photo saved automatically to ${upload.label}.${result.warning?' '+result.warning:''}`);setPhoto(null);pendingUpload.current=null;setCaption('');if(fileInput.current)fileInput.current.value='';await load();
  }
  async function choosePhoto(file){
    if(actionLock.current||!file||!selectedVehicle)return;
    actionLock.current=true;setBusy(true);setPhoto(null);pendingUpload.current=null;setError('');setNotice('Preparing your photo…');setPhotoStatus('preparing');
    const target={id:crypto.randomUUID(),vehicleId:vehicle,kind:photoKind,caption,isHero,coverFor,showroom:false,label:`${client.display_name||client.email} · ${vehicleLabel(selectedVehicle)}`};
    try{const blob=await prepareGaragePhoto(file);target.file=new File([blob],file.name.replace(/\.[^.]+$/,'')+(blob.type==='image/webp'?'.webp':'.jpg'),{type:blob.type});setPhoto(target.file);pendingUpload.current=target;await savePreparedPhoto(target)}
    catch(err){setPhotoStatus('error');setNotice('');setError(`Photo not saved. ${err.message}${pendingUpload.current?' Tap RETRY SAVE below.':''}`);if(!pendingUpload.current&&fileInput.current)fileInput.current.value=''}
    finally{actionLock.current=false;setBusy(false)}
  }
  // Many photos at once. Each is saved in turn; the cover only changes if "Use as their Garage cover" is ticked.
  async function chooseMany(files){
    if(actionLock.current||!files.length||!selectedVehicle)return;
    actionLock.current=true;setBusy(true);setError('');setPhoto(null);pendingUpload.current=null;setPhotoStatus('saving');
    let saved=0,failed=0;
    try{
      for(let i=0;i<files.length;i++){
        setNotice(`Saving photo ${i+1} of ${files.length}…`);
        try{
          const blob=await prepareGaragePhoto(files[i]);
          const file=new File([blob],files[i].name.replace(/\.[^.]+$/,'')+(blob.type==='image/webp'?'.webp':'.jpg'),{type:blob.type});
          const form=new FormData();form.append('vehicle_id',vehicle);form.append('upload_id',crypto.randomUUID());form.append('kind',photoKind);form.append('caption',caption);form.append('is_hero',String(isHero));form.append('cover_for',coverFor);form.append('showroom','false');form.append('file',file,file.name);
          const result=await garageRequest('/api/garage/photo',{method:'POST',body:form});
          setCustomers(list=>mergeSavedPhoto(list,result));saved++;
        }catch{failed++}
      }
    }finally{
      setNotice(`Saved ${saved} photo${saved===1?'':'s'}${failed?`. ${failed} could not be saved, so please choose those again`:''}.`);
      if(failed)setError(`${failed} photo${failed===1?'':'s'} could not be saved.`);
      setPhotoStatus(failed?'error':'saved');
      if(fileInput.current)fileInput.current.value='';
      actionLock.current=false;setBusy(false);await load();
    }
  }
  async function upload(e){
    e.preventDefault();if(actionLock.current||!pendingUpload.current)return;actionLock.current=true;setBusy(true);setError('');
    try{await savePreparedPhoto(pendingUpload.current)}catch(err){setPhotoStatus('error');setNotice('');setError(`Photo not saved. ${err.message} Tap RETRY SAVE below.`)}finally{actionLock.current=false;setBusy(false)}
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
        {client&&<form className="g-form admin-inline-form" onSubmit={changePassword}><h3>Customer password</h3><label>New password<div className="admin-password-wrap"><input type={showNewPassword?'text':'password'} minLength={8} value={newPassword} onChange={e=>setNewPassword(e.target.value)} required/><button type="button" className="g-text-button" onClick={()=>setShowNewPassword(v=>!v)}>{showNewPassword?'HIDE':'SHOW'}</button></div></label><button className="g-button" disabled={busy}>{busy?'SAVING…':'SAVE PASSWORD'}</button></form>}
        {creatingClient&&<form className="g-form admin-inline-form" onSubmit={addCustomer}><h3>Meet your new client.</h3><div className="g-form-row"><label>Client name<input value={name} onChange={e=>setName(e.target.value)} autoComplete="name" required maxLength={120}/></label><label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required maxLength={200}/></label></div><label>Garage password<div className="admin-password-wrap"><input type={showPassword?'text':'password'} autoComplete="new-password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} required/><button type="button" className="g-text-button" onClick={()=>setShowPassword(v=>!v)}>{showPassword?'HIDE':'SHOW'}</button></div></label><p className="g-inline-help">This password opens the customer’s Garage.</p><button className="g-button">{busy?'CREATING…':'CREATE & SELECT CLIENT'}</button></form>}
      </section>
      <section className={`g-panel admin-step${!client?' admin-locked':''}`} aria-labelledby="vehicle-step">
        <div className="admin-section-head"><div><p className="g-eyebrow">02 / THEIR RIDE</p><h2 id="vehicle-step">Choose a vehicle.</h2></div>{client&&<button type="button" className="g-button admin-add" disabled={!vehiclesLoaded} aria-expanded={creatingVehicle} onClick={()=>setCreatingVehicle(v=>!v)}>{creatingVehicle?'CANCEL':'+ ADD VEHICLE'}</button>}</div>
        {!client?<p className="g-muted">Select a client above to see their vehicles.</p>:<><div className="g-form"><label htmlFor="admin-vehicle">Vehicle for {client.display_name||client.email}</label><select id="admin-vehicle" value={vehicle} onChange={e=>selectVehicle(e.target.value)}><option value="">Select their vehicle</option>{vehicles.map(v=><option key={v.id} value={v.id}>{vehicleLabel(v)}</option>)}</select></div>{!vehiclesLoaded&&<p className="g-inline-help">Vehicle list could not refresh. Refresh above before adding another vehicle.</p>}{vehiclesLoaded&&!vehicles.length&&<p className="g-inline-help">No vehicles yet. Add their first one below.</p>}
        {vehiclesLoaded&&(creatingVehicle||!vehicles.length)&&<form className="g-form admin-inline-form" onSubmit={addVehicle}><h3>Add their vehicle.</h3><p className="g-inline-help">Just the model is required. Leave year and make blank if you’re unsure.</p><div className="g-form-row"><label>Year <span className="admin-optional">Optional</span><input type="number" min="1900" max={new Date().getFullYear()+1} step="1" placeholder="2024" value={year} onChange={e=>setYear(e.target.value)}/></label><label>Make <span className="admin-optional">Optional</span><input placeholder="Lexus" value={make} onChange={e=>setMake(e.target.value)} maxLength={80}/></label></div><div className="g-form-row"><label>Model<input placeholder="IS 350" value={model} onChange={e=>setModel(e.target.value)} required maxLength={100}/></label><label>Color <span className="admin-optional">Optional</span><input value={color} onChange={e=>setColor(e.target.value)} maxLength={60}/></label></div><button className="g-button">{busy?'SAVING…':'ADD & SELECT VEHICLE'}</button></form>}
        {client&&!!client.garage_vehicles?.length&&<div className="admin-vehicle-list"><h3>Vehicles on this account <span>({client.garage_vehicles.length})</span></h3>{client.garage_vehicles.map(v=><div key={v.id} className={`admin-vehicle-row${v.id===vehicle?' is-selected':''}`}><button type="button" className="g-text-button admin-vehicle-pick" onClick={()=>selectVehicle(v.id)}>{vehicleLabel(v)}{v.id===vehicle&&<span> · selected</span>}</button><button type="button" className="g-button admin-delete-btn" disabled={busy} onClick={()=>{if(confirm(`Delete ${vehicleLabel(v)} for good? Its photos, services and appointments will be removed.`))action({action:'delete_vehicle',vehicle_id:v.id},'Vehicle deleted.').then(d=>{if(d&&vehicle===v.id)setVehicle('')})}}>DELETE</button></div>)}</div>}
        {selectedVehicle&&<p className="admin-selection"><span aria-hidden="true">✓</span><strong>{vehicleLabel(selectedVehicle)}</strong><span>Selected for {client.display_name||client.email}</span></p>}</>}
      </section>
      <section id="admin-upload" className={`g-panel admin-step${!selectedVehicle?' admin-locked':''}`} aria-labelledby="photo-step">
        <p className="g-eyebrow">03 / MAKE IT THEIRS</p><h2 id="photo-step">Bring on the photos.</h2>
        {!selectedVehicle?<p className="g-muted">Choose a vehicle above to add its photos.</p>:<><p className="admin-context">{client.display_name||client.email}<span aria-hidden="true"> / </span><strong>{vehicleLabel(selectedVehicle)}</strong></p><form className="g-form admin-photo-form" onSubmit={upload}><p className="g-inline-help">Choose a photo and we save it immediately to this vehicle. Resizing, WebP conversion and location-data removal happen automatically.</p><details className="admin-photo-options"><summary>Photo options <span className="admin-optional">Optional · choose before uploading</span></summary><fieldset disabled={!!photo} className="admin-photo-options-fields"><div className="g-form-row"><label>Photo type<select value={photoKind} onChange={e=>setPhotoKind(e.target.value)}><option value="hero">Cover</option><option value="before">Before</option><option value="after">After</option><option value="gallery">Gallery</option></select></label><label>Caption <span className="admin-optional">Optional</span><input value={caption} onChange={e=>setCaption(e.target.value)} maxLength={160} placeholder="Fresh from a little VVM love"/></label></div><label className="g-check"><input type="checkbox" checked={isHero} onChange={e=>setIsHero(e.target.checked)}/> Use as their Garage cover</label>{isHero&&<label>Show this cover on<select value={coverFor} onChange={e=>setCoverFor(e.target.value)}><option value="desktop">Desktop (computer and tablet)</option><option value="mobile">Phone only</option></select></label>}</fieldset></details><label className="admin-dropzone">{preview?<img className="admin-photo-preview" src={preview} alt="Selected upload preview"/>:<span className="admin-upload-icon" aria-hidden="true">+</span>}<strong>{photo?photo.name:'Choose photo · saves automatically'}</strong><span>JPEG, PNG, WebP or HEIC · up to 20 MB</span><input ref={fileInput} type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={e=>chooseMany(Array.from(e.target.files||[]))}/></label><p className={`admin-upload-status is-${photoStatus}`} role="status">{photoStatus==='preparing'?'Preparing photo…':photoStatus==='saving'?'Saving to this vehicle… Please keep this page open.':photoStatus==='saved'?'✓ Saved to this vehicle. You can choose another photo.':photoStatus==='error'?'Photo not saved. Retry below or choose another photo.':'Ready. Your next photo saves automatically as the Garage cover.'}</p>{photo&&photoStatus==='error'&&<button className="g-button admin-save" disabled={busy}>RETRY SAVE</button>}</form>
        {!!selectedVehicle.garage_photos?.length&&<PhotoLayout vehicle={selectedVehicle} busy={busy} action={action} onSave={(ids,show)=>action({action:'save_photo_layout',vehicle_id:vehicle,photo_ids:ids,show},'Photo order and visibility saved.')}/>}
        </>}
      </section>
      <section className={`g-panel admin-step${!selectedVehicle?' admin-locked':''}`} aria-labelledby="preview-step"><p className="g-eyebrow">PREVIEW</p><h2 id="preview-step">See what they see.</h2>{!selectedVehicle?<p className="g-muted">Choose a vehicle above to preview its Garage.</p>:<ClientPreview clientId={customer} vehicleId={vehicle} vehicle={selectedVehicle} busy={busy} onSaveSizing={f=>action({action:'update_vehicle',vehicle_id:vehicle,...f},'Showroom size saved.')} sig={JSON.stringify([selectedVehicle.desktop_scale,selectedVehicle.desktop_x,selectedVehicle.desktop_y,selectedVehicle.phone_scale,selectedVehicle.phone_x,selectedVehicle.phone_y,selectedVehicle.mobile_hero_photo_id,selectedVehicle.protection_type,selectedVehicle.headlights_done,selectedVehicle.paint_correction,selectedVehicle.recommend_ceramic,selectedVehicle.show_headlights,selectedVehicle.show_paint,selectedVehicle.show_protection,selectedVehicle.show_ceramic_rec,selectedVehicle.ceramic_years,selectedVehicle.hero_photo_id,selectedVehicle.garage_photos?.length,selectedVehicle.garage_services?.length,client?.has_logo])}/>}</section>
      <section className="g-panel admin-speed" aria-labelledby="speed-step"><p className="g-eyebrow">FASTER LOADING</p><h2 id="speed-step">Speed up older photos.</h2><p className="g-muted">Makes a smaller copy of every photo saved before this update, so clients’ Garages load faster. Run it once. New photos are already fast.</p><SpeedUp onNotice={setNotice} onError={setError} onDone={load}/></section>
      <section className="admin-extras" aria-labelledby="optional-step"><p className="g-eyebrow">04 / WHEN YOU NEED IT</p><h2 id="optional-step">The extra details.</h2><p className="g-muted">All optional. Add what matters, whenever you’re ready.</p>
        {!selectedVehicle?<p className="g-inline-help">Choose a vehicle to add service history, appointments or a showroom cover.</p>:<div key={vehicle} className="admin-details-list">
          <details className="g-panel admin-disclosure" open><summary><span>Garage health<small>Protection, done ticks and what the client sees</small></span><b aria-hidden="true">+</b></summary><VehicleStatus vehicle={selectedVehicle} busy={busy} onSave={f=>action({action:'update_vehicle',vehicle_id:vehicle,...f})}/></details>
          <details className="g-panel admin-disclosure"><summary><span>Client phone<small>Used for their Garage booking</small></span><b aria-hidden="true">+</b></summary><ClientContact client={client} busy={busy} onSave={phone=>action({action:'set_contact',customer_id:customer,phone},'Phone number saved.')}/></details>
          <details className="g-panel admin-disclosure"><summary><span>Client logo<small>Shown top center in their My Garage</small></span><b aria-hidden="true">+</b></summary><ClientLogo client={client} busy={busy} onChanged={load} onError={setError} onNotice={setNotice}/></details>
          <details className="g-panel admin-disclosure"><summary><span>Completed detail & protection<small>Service history, notes and protection applied</small></span><b aria-hidden="true">+</b></summary><div className="admin-service-list">{!!selectedVehicle.garage_services?.length&&<><h3>Completed services</h3>{[...selectedVehicle.garage_services].sort((a,b)=>b.service_date.localeCompare(a.service_date)).map(sv=><div key={sv.id} className="admin-vehicle-row"><span><strong>{sv.title}</strong> · {fmtDate(sv.service_date)}</span><button type="button" className="g-button admin-delete-btn" disabled={busy} onClick={()=>{if(confirm(`Delete "${sv.title}" from ${fmtDate(sv.service_date)}?`))action({action:'delete_service',service_id:sv.id},'Service deleted.')}}>DELETE</button></div>)}</>}</div><form className="g-form" onSubmit={addService}><p className="admin-context">For {vehicleLabel(selectedVehicle)}</p><div className="g-form-row"><label>Completed on<input type="date" max={today()} value={serviceDate} onChange={e=>setServiceDate(e.target.value)} required/></label><label>Service name<input value={title} onChange={e=>setTitle(e.target.value)} required maxLength={140}/></label></div><label>Notes <span className="admin-optional">Optional</span><textarea value={description} onChange={e=>setDescription(e.target.value)} rows="3" maxLength={1500}/></label><div className="g-check-grid"><label><input type="checkbox" checked={sealant} onChange={e=>setSealant(e.target.checked)}/> Paint Ceramic Sealant Applied</label><label><input type="checkbox" checked={coating} onChange={e=>setCoating(e.target.checked)}/> True Ceramic Coating Applied</label><label><input type="checkbox" checked={leather} onChange={e=>setLeather(e.target.checked)}/> Leather Protection Applied</label><label><input type="checkbox" checked={fabric} onChange={e=>setFabric(e.target.checked)}/> Fabric Protection Applied</label></div>{sealant&&<p className="g-inline-help">Starts a new 3-month maintenance cycle, replaces the previous offer and schedules maintenance reminders.</p>}<button className="g-button">SAVE COMPLETED DETAIL</button></form></details>
          <details className="g-panel admin-disclosure"><summary><span>Appointment<small>Add a requested or confirmed visit</small></span><b aria-hidden="true">+</b></summary><form className="g-form" onSubmit={addAppointment}><p className="admin-context">For {vehicleLabel(selectedVehicle)}</p><div className="g-form-row"><label>Date (Eastern)<input type="date" value={apptDate} onChange={e=>setApptDate(e.target.value)} required/></label><label>Time (Eastern)<input type="time" value={apptTime} onChange={e=>setApptTime(e.target.value)} required/></label></div><label>Service<input value={apptService} onChange={e=>setApptService(e.target.value)} required maxLength={140}/></label><label>Status<select value={apptStatus} onChange={e=>setApptStatus(e.target.value)}><option value="confirmed">Confirmed</option><option value="requested">Requested</option></select></label><button className="g-button">SAVE APPOINTMENT</button></form></details>
        </div>}
      </section>
    </fieldset>
    <details className="g-panel admin-disclosure admin-directory"><summary><span>Client directory & history<small>Browse every client, vehicle and photo by date</small></span><b aria-hidden="true">+</b></summary>{loading?<p className="g-muted">Loading clients…</p>:<ClientDashboard customers={sortedCustomers} busy={busy} vehiclesLoaded={vehiclesLoaded} onAddPhoto={dashboardPhoto}/>}</details>
    <footer className="g-footer"><span>A little love. Every detail.</span><a href="/">Back to VVM Details →</a></footer>
  </main>;
}
