'use client';
import { useEffect, useMemo, useState } from 'react';
import { garageRequest, signOut } from './garage-auth-client';
import GaragePhotoEditor from './garage-photo-editor';

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
async function webp(file) {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  const image = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Could not process this photo.')),'image/webp',0.84));
  if (blob.size > 4*1024*1024) throw new Error('This photo is too large to upload.');
  return blob;
}

const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const easternDay = iso => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

// Clients by name, then each vehicle's dates (services and photos) so photos are easy to find by date
function ClientDashboard({ customers, onAddPhoto }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => customers.filter(c => `${c.display_name || ''} ${c.email || ''}`.toLowerCase().includes(q.trim().toLowerCase())), [customers, q]);
  return <section className="g-panel admin-dash"><p className="g-eyebrow">DASHBOARD</p><h2>Clients</h2>
    <input className="dash-search" placeholder="Search by name or email" value={q} onChange={e => setQ(e.target.value)} aria-label="Search clients"/>
    {list.length === 0 && <p className="g-muted">No clients yet.</p>}
    {list.map(c => <article className="dash-client" key={c.user_id}>
      <h3>{c.display_name || c.email}</h3><p className="g-muted">{c.email}</p>
      {(c.garage_vehicles || []).length === 0 && <p className="g-muted">No vehicles yet.</p>}
      {(c.garage_vehicles || []).map(v => {
        const days = {};
        (v.garage_services || []).forEach(s => { (days[s.service_date] = days[s.service_date] || { services: [], photos: [] }).services.push(s.title); });
        (v.garage_photos || []).forEach(p => { const d = easternDay(p.created_at); (days[d] = days[d] || { services: [], photos: [] }).photos.push(p); });
        const keys = Object.keys(days).sort().reverse();
        return <div className="dash-vehicle" key={v.id}>
          <div className="dash-vhead"><b>{v.year} {v.make} {v.model}</b><button type="button" className="g-text-button" onClick={() => onAddPhoto(v.id)}>+ ADD PHOTOS</button></div>
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
  const [customers,setCustomers]=useState([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const [email,setEmail]=useState(''),[name,setName]=useState(''),[password,setPassword]=useState('');
  const [customer,setCustomer]=useState(''),[year,setYear]=useState(''),[make,setMake]=useState(''),[model,setModel]=useState(''),[color,setColor]=useState('');
  const [vehicle,setVehicle]=useState(''),[serviceDate,setServiceDate]=useState(today()),[title,setTitle]=useState('Full Factory Reset'),[description,setDescription]=useState('');
  const [sealant,setSealant]=useState(false),[coating,setCoating]=useState(false),[leather,setLeather]=useState(false),[fabric,setFabric]=useState(false);
  const [photo,setPhoto]=useState(null),[photoKind,setPhotoKind]=useState('hero'),[caption,setCaption]=useState(''),[isHero,setIsHero]=useState(true);
  const [apptDate,setApptDate]=useState(''),[apptTime,setApptTime]=useState(''),[apptService,setApptService]=useState('Full Factory Reset'),[apptStatus,setApptStatus]=useState('confirmed');
  const vehicles=useMemo(()=>customers.flatMap(c=>(c.garage_vehicles||[]).map(v=>({...v,owner:c.display_name||c.email,ownerId:c.user_id}))),[customers]);
  async function load(){try{const d=await garageRequest('/api/garage/admin');setCustomers(d.customers);setError('')}catch(e){setError(e.message)}}
  useEffect(()=>{load()},[]);
  useEffect(()=>{if(vehicles.length&&!vehicle)setVehicle(vehicles[0].id)},[vehicles,vehicle]);
  async function action(body){setBusy(true);setError('');setNotice('');try{const d=await garageRequest('/api/garage/admin',{method:'POST',body:JSON.stringify(body)});setNotice(d.message||'Saved.');await load();return d}catch(e){setError(e.message);return null}finally{setBusy(false)}}
  async function addCustomer(e){e.preventDefault();const chosen=window.prompt('Create a temporary password for this customer (at least 8 characters):','');if(chosen===null)return;const d=await action({action:'create_customer',email,display_name:name,password:chosen});if(d){setEmail('');setName('');setPassword('')}}
  async function addVehicle(e){e.preventDefault();const d=await action({action:'create_vehicle',customer_id:customer,year,make,model,color});if(d){setVehicle(d.vehicle.id);setYear('');setMake('');setModel('');setColor('')}}
  async function addService(e){e.preventDefault();const d=await action({action:'record_service',vehicle_id:vehicle,service_date:serviceDate,title,description,paint_sealant:sealant,ceramic_coating:coating,leather_protection:leather,fabric_protection:fabric});if(d){setDescription('');setSealant(false);setCoating(false);setLeather(false);setFabric(false)}}
  async function upload(e){e.preventDefault();if(!photo||!vehicle)return;setBusy(true);setError('');setNotice('');try{const blob=await webp(photo);const form=new FormData();form.append('vehicle_id',vehicle);form.append('kind',photoKind);form.append('caption',caption);form.append('is_hero',String(isHero));form.append('file',blob,'garage-photo.webp');const d=await garageRequest('/api/garage/photo',{method:'POST',body:form});if(isHero)await garageRequest('/api/garage/admin',{method:'POST',body:JSON.stringify({action:'set_hero',photo_id:d.photo.id})});setNotice('Photo added to the private vehicle gallery. Phone location metadata has been removed.');setPhoto(null);setCaption('');e.target.reset()}catch(err){setError(err.message)}finally{setBusy(false)}}
  async function addAppointment(e){e.preventDefault();if(!apptDate||!apptTime)return;try{await action({action:'appointment',vehicle_id:vehicle,starts_at:easternDateTime(apptDate,apptTime),service_label:apptService,status:apptStatus})}catch(err){setError(err.message)}}
  const selectedVehicle=vehicles.find(v=>v.id===vehicle);
  return <main className="garage-shell admin-shell"><header className="garage-top"><a className="garage-brand" href="/"><img src="/assets/logo.jpg" alt=""/> VVM DETAILS <span className="admin-pill">ADMIN</span></a><div className="garage-account"><a href="/garage">CUSTOMER VIEW</a><button className="g-text-button" onClick={signOut}>SIGN OUT</button></div></header><div className="garage-heading"><div><p className="g-eyebrow">PRIVATE CUSTOMER MANAGEMENT</p><h1>Garage Admin</h1><p className="g-muted">Add a client, their vehicles, service history, appointments, and photos.</p></div></div>{error&&<p className="g-alert" role="alert">{error}{/sign in/i.test(error)&&<> <a href="/admin">Sign in as admin</a></>}</p>}{notice&&<p className="g-notice" role="status">{notice}</p>}<ClientDashboard customers={customers} onAddPhoto={id=>{setVehicle(id);document.getElementById('admin-upload')?.scrollIntoView({behavior:'smooth',block:'center'})}}/><GaragePhotoEditor vehicles={vehicles} onSaved={load}/><section className="admin-grid"><form className="g-panel g-form" onSubmit={addCustomer}><p className="g-eyebrow">STEP 1</p><h2>Invite Customer</h2><label>Customer name<input value={name} onChange={e=>setName(e.target.value)} required/></label><label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label><button className="g-button" disabled={busy}>SEND SECURE INVITE</button></form><form className="g-panel g-form" onSubmit={addVehicle}><p className="g-eyebrow">STEP 2</p><h2>Add Vehicle</h2><label>Customer<select required value={customer} onChange={e=>setCustomer(e.target.value)}><option value="">Select customer</option>{customers.map(c=><option key={c.user_id} value={c.user_id}>{c.display_name||c.email}</option>)}</select></label><div className="g-form-row"><label>Year<input type="number" min="1900" max="2200" value={year} onChange={e=>setYear(e.target.value)} required/></label><label>Make<input value={make} onChange={e=>setMake(e.target.value)} required/></label></div><label>Model<input value={model} onChange={e=>setModel(e.target.value)} required/></label><label>Color (optional)<input value={color} onChange={e=>setColor(e.target.value)}/></label><button className="g-button" disabled={busy}>ADD VEHICLE</button></form><form className="g-panel g-form admin-wide" onSubmit={addService}><p className="g-eyebrow">STEP 3</p><h2>Record Completed Detail</h2><label>Vehicle<select required value={vehicle} onChange={e=>setVehicle(e.target.value)}><option value="">Select vehicle</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.year} {v.make} {v.model} · {v.owner}</option>)}</select></label><div className="g-form-row"><label>Service date<input type="date" value={serviceDate} onChange={e=>setServiceDate(e.target.value)} required/></label><label>Service name<input value={title} onChange={e=>setTitle(e.target.value)} required/></label></div><label>Notes<textarea value={description} onChange={e=>setDescription(e.target.value)} rows="3"/></label><div className="g-check-grid"><label><input type="checkbox" checked={sealant} onChange={e=>setSealant(e.target.checked)}/> Paint Ceramic Sealant Applied</label><label><input type="checkbox" checked={coating} onChange={e=>setCoating(e.target.checked)}/> True Ceramic Coating Applied</label><label><input type="checkbox" checked={leather} onChange={e=>setLeather(e.target.checked)}/> Leather Protection Applied</label><label><input type="checkbox" checked={fabric} onChange={e=>setFabric(e.target.checked)}/> Fabric Protection Applied</label></div>{sealant&&<p className="g-inline-help">This starts a new 3-month cycle, invalidates the old offer, and queues the Month 1 and Month 3 Brevo automation event.</p>}<button className="g-button" disabled={busy||!vehicle}>SAVE SERVICE</button></form><form id="admin-upload" className="g-panel g-form" onSubmit={upload}><p className="g-eyebrow">STEP 4</p><h2>Upload Vehicle Photo</h2><label>Vehicle<select required value={vehicle} onChange={e=>setVehicle(e.target.value)}><option value="">Select vehicle</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.year} {v.make} {v.model} · {v.owner}</option>)}</select></label><label>Photo kind<select value={photoKind} onChange={e=>setPhotoKind(e.target.value)}><option value="hero">Hero / cover</option><option value="before">Before</option><option value="after">After</option><option value="gallery">Gallery</option></select></label><label>Caption<input value={caption} onChange={e=>setCaption(e.target.value)}/></label><label>Photo (JPEG/PNG/HEIC)<input type="file" accept="image/*" onChange={e=>setPhoto(e.target.files?.[0]||null)} required/></label><label className="g-check"><input type="checkbox" checked={isHero} onChange={e=>setIsHero(e.target.checked)}/> Set as vehicle cover photo</label><button className="g-button" disabled={busy||!vehicle||!photo}>PROCESS & UPLOAD</button><p className="g-inline-help">Images are resized and converted to WebP before upload, removing embedded location data.</p></form><form className="g-panel g-form" onSubmit={addAppointment}><p className="g-eyebrow">STEP 5</p><h2>Manage Appointment</h2><label>Vehicle<select required value={vehicle} onChange={e=>setVehicle(e.target.value)}><option value="">Select vehicle</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.year} {v.make} {v.model} · {v.owner}</option>)}</select></label><div className="g-form-row"><label>Date (Eastern)<input type="date" value={apptDate} onChange={e=>setApptDate(e.target.value)} required/></label><label>Time (Eastern)<input type="time" value={apptTime} onChange={e=>setApptTime(e.target.value)} required/></label></div><label>Service<input value={apptService} onChange={e=>setApptService(e.target.value)} required/></label><label>Status<select value={apptStatus} onChange={e=>setApptStatus(e.target.value)}><option value="confirmed">Confirmed</option><option value="requested">Requested</option></select></label><button className="g-button" disabled={busy||!vehicle}>SAVE APPOINTMENT</button></form></section><section className="g-panel admin-customer-list"><p className="g-eyebrow">CUSTOMER ACCOUNTS</p><h2>{customers.length} Customers</h2>{customers.length?<div className="g-admin-list">{customers.map(c=><article key={c.user_id}><div><strong>{c.display_name||'Customer'}</strong><span>{c.email}</span></div><span>{(c.garage_vehicles||[]).length} vehicle{(c.garage_vehicles||[]).length===1?'':'s'}</span></article>)}</div>:<p className="g-muted">Loading customer list…</p>}</section></main>;
}
