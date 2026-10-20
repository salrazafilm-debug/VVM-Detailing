'use client';
import {useEffect,useRef,useState} from 'react';
import {garageRequest,supabaseBrowser} from './garage-auth-client';
import {openGarageImage,exportGarageCanvas} from './garage-image';
import {vehicleLabel} from '../server/garage-vehicle';

export default function GaragePhotoEditor({vehicles,onSaved,selectedVehicleId,onBusyChange}) {
  const canvas=useRef(null),image=useRef(null),room=useRef(null);
  const [vehicle,setVehicle]=useState(selectedVehicleId||''),[source,setSource]=useState(null),[scale,setScale]=useState(100),[x,setX]=useState(50),[y,setY]=useState(58),[rendering,setRendering]=useState(false),[busy,setBusy]=useState(false),[cutoutReady,setCutoutReady]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  const current=vehicles.find(v=>v.id===vehicle);
  function setWorking(value){setBusy(value);onBusyChange?.(value)}
  useEffect(()=>{let active=true;const background=new Image();background.onload=()=>{if(active){room.current=background;draw()}};background.src='/assets/garage/showroom.webp';draw();return()=>{active=false}},[]);
  useEffect(()=>{if(!source)return;let active=true;setRendering(true);openGarageImage(source).then(bitmap=>{if(!active){bitmap.close?.();return}image.current?.close?.();image.current=bitmap;draw();setRendering(false)}).catch(()=>{if(active){setRendering(false);setSource(null);setError('This image could not be opened. Try another photo.')}});return()=>{active=false}},[source]);
  useEffect(()=>{draw()},[scale,x,y]);
  useEffect(()=>()=>image.current?.close?.(),[]);
  function draw(target=canvas.current,withRoom=true){
    if(!target)return;const ctx=target.getContext('2d');ctx.clearRect(0,0,1536,1024);
    if(withRoom){if(room.current)ctx.drawImage(room.current,0,0,1536,1024);else{ctx.fillStyle='#e9b3b3';ctx.fillRect(0,0,1536,1024)}}
    const im=image.current;
    if(im){const fit=Math.min(1310/im.width,700/im.height)*Number(scale)/100,w=im.width*fit,h=im.height*fit,left=1536*Number(x)/100-w/2,top=1024*Number(y)/100-h/2;if(withRoom){ctx.fillStyle='#39242c40';ctx.beginPath();ctx.ellipse(left+w/2,top+h-5,w*.37,14,0,0,Math.PI*2);ctx.fill()}ctx.drawImage(im,left,top,w,h)}
  }
  async function choose(file){
    if(!file)return;setError('');setMessage('');setWorking(true);setCutoutReady(false);
    try{const im=await openGarageImage(file),c=document.createElement('canvas'),ratio=Math.min(1,1800/Math.max(im.width,im.height));c.width=Math.round(im.width*ratio);c.height=Math.round(im.height*ratio);const ctx=c.getContext('2d');ctx.drawImage(im,0,0,c.width,c.height);im.close?.();const pixels=ctx.getImageData(0,0,c.width,c.height).data;let clear=false,solid=false;for(let i=3;i<pixels.length;i+=4){if(pixels[i]<32)clear=true;if(pixels[i]>100)solid=true;if(clear&&solid)break}setCutoutReady(clear&&solid);setSource(await exportGarageCanvas(c));setScale(100);setX(50);setY(58);setMessage(clear&&solid?'Cutout ready. Adjust the preview, then save it to this vehicle.':'Remove the background before saving a showroom cutout. Your original vehicle angle stays the same.')}
    catch(e){setError(e.message||'Unable to prepare that photo.');setSource(null)}finally{setWorking(false)}
  }
  async function remove(){
    setWorking(true);setError('');setMessage('Removing the background…');
    try{const {data}=await supabaseBrowser().auth.getSession();if(!data.session)throw Error('Please sign in again.');const form=new FormData();form.append('file',source,source.type==='image/webp'?'car.webp':'car.png');const response=await fetch('/api/garage/prepare-photo',{method:'POST',headers:{Authorization:`Bearer ${data.session.access_token}`},body:form});if(!response.ok){const d=await response.json();throw Error(d.error||'Background removal failed.')}setSource(await response.blob());setCutoutReady(true);setMessage('Background removed. Check the edges, adjust the preview and save.')}
    catch(e){setError(e.message);setMessage('')}finally{setWorking(false)}
  }
  async function save(){
    if(!cutoutReady||!current)return;setWorking(true);setError('');
    try{const exportCanvas=document.createElement('canvas');exportCanvas.width=1536;exportCanvas.height=1024;draw(exportCanvas,false);const blob=await exportGarageCanvas(exportCanvas),form=new FormData();form.append('file',blob,'showroom-vehicle.webp');form.append('vehicle_id',vehicle);form.append('kind','hero');form.append('caption','Showroom vehicle photo');form.append('is_hero','true');form.append('keep_framing','true');const result=await garageRequest('/api/garage/photo',{method:'POST',body:form});setMessage(result.warning||'Approved and saved. This vehicle now appears in the client’s showroom.');await onSaved(result)}
    catch(e){setError(e.message)}finally{setWorking(false)}
  }
  return <section className="g-panel g-form showroom-editor"><p className="g-eyebrow">YOUR VEHICLE. THEIR SHOWROOM.</p><h2>Showroom Photo Studio</h2><p className="g-muted">The pink room stays the same. Upload a transparent cutout, or remove the photo background, then position the vehicle and save.</p>{!selectedVehicleId&&<label>Vehicle<select value={vehicle} onChange={e=>{setVehicle(e.target.value);setMessage('')}} disabled={busy}><option value="">Select customer vehicle</option>{vehicles.map(v=><option key={v.id} value={v.id}>{vehicleLabel(v)} · {v.owner}</option>)}</select></label>}<label>Vehicle photo or transparent cutout<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" disabled={busy} onChange={e=>choose(e.target.files?.[0])}/></label><p className="g-inline-help">Best photo: front three-quarter angle, camera at headlight height, whole car and wheels visible, with space around every edge. We preserve the real angle and vehicle details.</p><button type="button" className="g-button" disabled={busy||rendering||!source||cutoutReady} onClick={remove}>REMOVE BACKGROUND</button><p className="g-inline-help">Background removal uses your remove.bg credits. A transparent PNG/WebP skips this step.</p><canvas ref={canvas} width="1536" height="1024" aria-label="Client showroom preview"/><div className="g-form-row">{[['Car size',scale,setScale,10,300],['Horizontal position',x,setX,-50,150],['Vertical position',y,setY,-50,150]].map(([label,value,set,min,max])=><label key={label}>{label}<input type="range" min={min} max={max} value={value} disabled={busy} onChange={e=>set(e.target.value)}/></label>)}</div><button type="button" className="g-button" disabled={busy||rendering||!source||!current||!cutoutReady} onClick={save}>{busy?'PLEASE WAIT…':`APPROVE & SAVE${current?` · ${vehicleLabel(current)}`:''}`}</button><p className="g-inline-help">Saves only to the selected vehicle. Existing gallery photos stay available. No vehicle photo means an empty showroom.</p>{error&&<p className="g-alert" role="alert">{error}</p>}{message&&<p className="g-notice" role="status">{message}</p>}</section>;
}
