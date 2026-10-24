const { customerContext, requireAdmin, responseError, config } = require('./garage-auth');
const { createClient } = require('@supabase/supabase-js');
const { vehicleLabel } = require('./garage-vehicle');
const { prepareShowroomPhoto } = require('./garage-showroom');

const json = (data, status = 200) => Response.json(data, { status });
const sharp = require('sharp');
// Smaller copy served to clients: loads faster on phones. The original is kept.
async function displayCopy(bytes) {
  try { return await sharp(bytes).resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82, effort: 4 }).toBuffer(); }
  catch { return null; }
}
const clean = (s, max = 300) => String(s || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const easternToday = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

async function addPhotoUrls(admin, rows) {
  return Promise.all((rows || []).map(async row => {
    const { data } = await admin.storage.from('garage-photos').createSignedUrl(row.display_path || row.storage_path, 900);
    const {storage_path,display_path,...photo}=row;
    return { ...photo, is_cutout: /\/cutout-/.test(storage_path), url: data?.signedUrl || null };
  }));
}

exports.customerGet = async req => {
  try {
    const ctx = await customerContext(req);
    const previewId = new URL(req.url).searchParams.get('client');
    if (previewId) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(previewId)) throw Object.assign(new Error('Invalid client.'), {status:400});
      await requireAdmin(ctx);
    }
    const owner = previewId || ctx.user.id, db = previewId ? ctx.admin : ctx.db;
    const [{ data: profile, error: pErr }, { data: vehicles, error: vErr }] = await Promise.all([
      db.from('garage_profiles').select('*').eq('user_id', owner).maybeSingle(),
      db.from('garage_vehicles').select('*').eq('customer_id', owner).order('created_at', { ascending: true }),
    ]);
    if (previewId && !profile && !pErr) throw Object.assign(new Error('Client not found.'), {status:404});
    const logo = profile?.logo_path ? (await ctx.admin.storage.from('garage-photos').createSignedUrl(profile.logo_path, 900)).data?.signedUrl || null : null;
    const publicProfile = p => p ? { display_name: p.display_name, email: p.email, phone: p.phone || '', logo_url: logo } : p;
    const clientJson = data => Response.json({...data,profile:publicProfile(data.profile),preview:!!previewId},{headers:{'Cache-Control':'private, no-store'}});
    if (pErr || vErr) throw Object.assign(new Error('Could not load your Garage.'), { status: 503 });
    const ids = (vehicles || []).map(v => v.id);
    if (!ids.length) return clientJson({ profile: profile || { email: ctx.user.email }, vehicles: [] });
    const [sv, ph, ap, cy, offers] = await Promise.all([
      db.from('garage_services').select('*').in('vehicle_id', ids).order('service_date', { ascending: false }),
      db.from('garage_photos').select('*').in('vehicle_id', ids).order('created_at', { ascending: false }),
      db.from('garage_appointments').select('*').in('vehicle_id', ids).gte('starts_at', new Date().toISOString()).in('status', ['requested','confirmed']).order('starts_at'),
      db.from('garage_maintenance_cycles').select('*').in('vehicle_id', ids).eq('status', 'active'),
      db.from('garage_offers').select('*').in('vehicle_id', ids).eq('status','available').gte('expires_at',easternToday()),
    ]);
    for (const q of [sv, ph, ap, cy, offers]) if (q.error) throw Object.assign(new Error('Could not load Garage details.'), { status: 503 });
    const photos = await addPhotoUrls(ctx.admin, ph.data);
    // Membership price for the reset, from Square. The page shows it struck through and the half price.
    const reset = await (async () => {
      try {
        const { loadCatalog } = require('./square');
        return Object.values(await loadCatalog()).filter(x => x.item === 'Full Factory Reset');
      } catch { return []; }
    })();
    const payload = vehicles.map(v => ({
      ...v,
      services: sv.data.filter(x => x.vehicle_id === v.id),
      photos: photos.filter(x => x.vehicle_id === v.id),
      appointments: ap.data.filter(x => x.vehicle_id === v.id),
      cycle: cy.data.find(x => x.vehicle_id === v.id) || null,
      offer: (() => {
        const o = offers.data.find(x => x.vehicle_id === v.id && x.status === 'available') || null;
        if (!o) return null;
        const { sizeMatches } = require('./coupon-db');
        const match = v.vehicle_size ? reset.find(x => sizeMatches(x.label, v.vehicle_size)) : null;
        return { ...o, size: v.vehicle_size || null, variation_id: match?.id || null, normal_cents: match?.priceCents ?? null, price_cents: match ? Math.ceil(match.priceCents / 2) : null };
      })(),
    }));
    return clientJson({ profile: profile || { email: ctx.user.email }, vehicles: payload });
  } catch (e) { return responseError(e); }
};

exports.adminGet = async req => {
  try {
    const ctx = await requireAdmin(await customerContext(req));
    const { data: profiles, error } = await ctx.admin.from('garage_profiles').select('*').order('created_at', { ascending: false });
    if (error) throw Object.assign(new Error('Could not load customers.'), { status: 503 });
    // Photos reference vehicles, and vehicles also reference their cover photo.
    // Read each table explicitly: embedding garage_photos is ambiguous in PostgREST.
    const {data: vehicles,error:vehicleError}=await ctx.admin.from('garage_vehicles').select('*').order('created_at', {ascending:true});
    const ids=(vehicles||[]).map(v=>v.id);
    const [services,photos]=ids.length&&!vehicleError?await Promise.all([
      ctx.admin.from('garage_services').select('id,vehicle_id,service_date,title').in('vehicle_id',ids),
      ctx.admin.from('garage_photos').select('id,vehicle_id,photo_kind,caption,created_at,storage_path,display_path,show_on_garage,sort_order').in('vehicle_id',ids).order('created_at',{ascending:false}),
    ]):[{data:[]},{data:[]}];
    const warnings=[];
    if(vehicleError)warnings.push('Vehicle list could not refresh. Existing records have not been removed. Please refresh before adding vehicles.');
    if(services.error)warnings.push('Service history could not refresh.');
    if(photos.error)warnings.push('Photo list could not refresh. Saved photos have not been removed.');
    const urls={};
    if(photos.data?.length){
      try {
        const {data:signed,error:signError}=await ctx.admin.storage.from('garage-photos').createSignedUrls(photos.data.map(p=>p.display_path||p.storage_path),900);
        (signed||[]).forEach(s=>{if(s.signedUrl)urls[s.path]=s.signedUrl});
        if(signError||photos.data.some(p=>!urls[p.display_path||p.storage_path]))warnings.push('Photos are saved, but some private previews could not refresh.');
      } catch {warnings.push('Photos are saved, but private previews could not refresh.');}
    }
    const safePhotos=(photos.data||[]).map(({storage_path,display_path,...p})=>({...p,is_cutout:/\/cutout-/.test(storage_path),url:urls[display_path||storage_path]||null}));
    const rows=(vehicles||[]).map(v=>({...v,garage_services:(services.data||[]).filter(s=>s.vehicle_id===v.id),garage_photos:safePhotos.filter(p=>p.vehicle_id===v.id)}));
    const logoUrls={};
    await Promise.all((profiles||[]).filter(p=>p.logo_path).map(async p=>{try{logoUrls[p.user_id]=(await ctx.admin.storage.from('garage-photos').createSignedUrl(p.logo_path,900)).data?.signedUrl||null}catch{}}));
    const data=(profiles||[]).map(({logo_path,...profile})=>({...profile,has_logo:!!logo_path,logo_url:logoUrls[profile.user_id]||null,garage_vehicles:rows.filter(v=>v.customer_id===profile.user_id)}));
    return Response.json({customers:data,read_status:{vehicles:!vehicleError,services:!vehicleError&&!services.error,photos:!vehicleError&&!photos.error},showroom:{background_removal_available:!!process.env.REMOVE_BG_API_KEY},warning:warnings.join(' ')||null},{headers:{'Cache-Control':'no-store'}});
  } catch (e) { return responseError(e); }
};

exports.adminPost = async req => {
  let ctx;
  try {
    ctx = await requireAdmin(await customerContext(req));
    const b = await req.json();
    const action = clean(b.action, 40);
    if (action === 'create_customer') {
      const email = clean(b.email, 200).toLowerCase();
      const display_name = clean(b.display_name, 120);
      const password = String(b.password || '');
      if (!display_name) throw Object.assign(new Error('Enter the customer name.'), { status: 400 });
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw Object.assign(new Error('Enter a valid customer email.'), { status: 400 });
      if (password.length < 8) throw Object.assign(new Error('Use a temporary password with at least 8 characters.'), { status: 400 });
      let { data, error } = await ctx.admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name } });
      let recovered=false;
      if (error && (['email_exists','user_already_exists'].includes(error.code)||/already/i.test(error.message))) {
        // Repair a partial registration without replacing an existing account/password.
        for(let page=1;page<=100;page++) {
          const {data:listed,error:listError}=await ctx.admin.auth.admin.listUsers({page,perPage:100});
          if(listError) break;
          const user=listed.users.find(u=>u.email?.toLowerCase()===email);
          if(user){data={user};recovered=true;error=null;break}
          if(listed.users.length<100)break;
        }
      }
      if (error) throw Object.assign(new Error('Could not create this customer login. Please check the email and try again.'), { status: 400 });
      const customer={user_id:data.user.id,email,display_name};
      if(recovered){
        const {data:existing,error:lookupError}=await ctx.admin.from('garage_profiles').select('user_id,display_name,email').eq('user_id',data.user.id).maybeSingle();
        if(lookupError)throw Object.assign(new Error('Could not check the existing customer profile. Please retry.'),{status:503});
        if(existing)return json({ok:true,customer_id:existing.user_id,customer:{...existing,garage_vehicles:[]},message:'Existing client selected. Their password has not changed.'});
      }
      const { error: pErr } = await ctx.admin.from('garage_profiles').upsert(customer, { onConflict: 'user_id' });
      if (pErr) throw Object.assign(new Error('Login created but profile setup failed. Retry from the customer list.'), { status: 503 });
      return json({ ok: true, customer_id: data.user.id, customer:{...customer,garage_vehicles:[]}, message: recovered ? 'Customer profile recovered and selected. Their original password has not changed.' : 'Client login created and selected. Add their vehicle below, then share their login privately.' });
    }
    if (action === 'set_password') {
      const customer_id = clean(b.customer_id, 80), password = String(b.password || '');
      if (!customer_id || password.length < 8) throw Object.assign(new Error('Use a password with at least 8 characters.'), { status: 400 });
      const { error } = await ctx.admin.auth.admin.updateUserById(customer_id, { password });
      if (error) throw Object.assign(new Error('Could not change this customer password.'), { status: 400 });
      return json({ ok:true, message:'Customer password updated. Share it privately.' });
    }
    if (action === 'create_vehicle') {
      const customer_id = clean(b.customer_id, 80);
      const yearText = String(b.year ?? '').trim();
      const year = yearText ? Number(yearText) : null;
      const make = clean(b.make, 80), model = clean(b.model, 100);
      if (!customer_id || (year !== null && (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear() + 1)) || !model) throw Object.assign(new Error('Select a client and enter the vehicle model. If you enter a year, use a valid whole year.'), { status: 400 });
      const { data, error } = await ctx.admin.from('garage_vehicles').insert({ customer_id, year, make: make || null, model, color: clean(b.color, 60) || null, hero_photo_id: null }).select().single();
      if (error) {
        const pendingUpdate = error.code === '23502' && /year|make/.test(error.message || '');
        throw Object.assign(new Error(pendingUpdate ? 'Your Garage database still requires year and make. Apply the optional vehicle fields update, then retry.' : 'Could not add vehicle. Confirm the customer exists.'), { status: pendingUpdate ? 503 : 400 });
      }
      return json({ ok: true, vehicle: data });
    }
    if (action === 'update_vehicle') {
      const vehicle_id = clean(b.vehicle_id, 80);
      if (!vehicle_id) throw Object.assign(new Error('Choose a vehicle.'), { status: 400 });
      const patch = {};
      for (const k of ['paint_correction','headlights_done','recommend_ceramic','show_headlights','show_paint','show_protection','show_ceramic_rec']) if (k in b) patch[k] = b[k] === true;
      if ('vehicle_size' in b) {
        if (b.vehicle_size !== null && !['coupe','sedan','suv','truck','minivan'].includes(b.vehicle_size)) throw Object.assign(new Error('Choose a vehicle size.'), { status: 400 });
        patch.vehicle_size = b.vehicle_size || null;
      }
      if ('protection_type' in b) patch.protection_type = b.protection_type === 'sealant' || b.protection_type === 'coating' ? b.protection_type : null;
      if ('ceramic_years' in b || patch.protection_type === 'coating') {
        const years = Number(b.ceramic_years);
        if (patch.protection_type === 'coating' && (!Number.isInteger(years) || years < 1 || years > 15)) throw Object.assign(new Error('Enter ceramic years from 1 to 15.'), { status: 400 });
        if (Number.isInteger(years) && years >= 1 && years <= 15) patch.ceramic_years = years;
      }
      for (const dev of ['desktop','phone']) {
        const ranges = { scale: [10, 300], x: [-50, 150], y: [-50, 150] };
        for (const [k, [min, max]] of Object.entries(ranges)) {
          const key = `${dev}_${k}`;
          if (!(key in b)) continue;
          const n = Number(b[key]);
          if (!Number.isInteger(n) || n < min || n > max) throw Object.assign(new Error('Showroom size or position is out of range.'), { status: 400 });
          patch[key] = n;
        }
      }
      if (!Object.keys(patch).length) return json({ ok: true, message: 'Nothing to save.' });
      const { error } = await ctx.admin.from('garage_vehicles').update(patch).eq('id', vehicle_id);
      if (error) throw Object.assign(new Error('Could not save. Run the Garage visibility update in Supabase first.'), { status: 503 });
      return json({ ok: true, message: 'Garage saved.' });
    }
    if (action === 'set_photo_visibility') {
      const photo_id = clean(b.photo_id, 80);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(photo_id)) throw Object.assign(new Error('Choose a photo.'), { status: 400 });
      const { error } = await ctx.admin.from('garage_photos').update({ show_on_garage: b.show === true }).eq('id', photo_id);
      if (error) throw Object.assign(new Error('Could not update this photo. Run the Garage visibility update in Supabase first.'), { status: 503 });
      return json({ ok: true, message: b.show === true ? 'Shown on My Garage.' : 'Hidden from My Garage.' });
    }
    if (action === 'save_photo_layout') {
      // One save for the photo order and Show on My Garage. Nothing changes until the admin presses Save.
      const vehicle_id = clean(b.vehicle_id, 80);
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const ids = Array.isArray(b.photo_ids) ? b.photo_ids.slice(0, 300) : [];
      const show = b.show && typeof b.show === 'object' ? b.show : {};
      if (!uuid.test(vehicle_id) || !ids.every(id => uuid.test(id))) throw Object.assign(new Error('Could not save the photo layout.'), { status: 400 });
      const writes = ids.map((id, i) => ctx.admin.from('garage_photos').update({ sort_order: i, ...(id in show ? { show_on_garage: show[id] === true } : {}) }).eq('id', id).eq('vehicle_id', vehicle_id));
      const results = await Promise.all(writes);
      if (results.some(r => r.error)) throw Object.assign(new Error('Could not save the photo layout. Try again.'), { status: 503 });
      return json({ ok: true, message: 'Photo order and visibility saved.' });
    }
    if (action === 'reorder_photos') {
      const vehicle_id = clean(b.vehicle_id, 80);
      const ids = Array.isArray(b.photo_ids) ? b.photo_ids.slice(0, 200) : [];
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(vehicle_id) || !ids.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) throw Object.assign(new Error('Could not reorder photos.'), { status: 400 });
      const results = await Promise.all(ids.map((id, i) => ctx.admin.from('garage_photos').update({ sort_order: i }).eq('id', id).eq('vehicle_id', vehicle_id)));
      if (results.some(r => r.error)) throw Object.assign(new Error('Could not save the new photo order. Try again.'), { status: 503 });
      return json({ ok: true, message: 'Photo order saved.' });
    }
    if (action === 'delete_vehicle') {
      const vehicle_id = clean(b.vehicle_id, 80);
      if (!vehicle_id) throw Object.assign(new Error('Choose a vehicle.'), { status: 400 });
      const { data: photos } = await ctx.admin.from('garage_photos').select('storage_path,display_path').eq('vehicle_id', vehicle_id);
      const { error } = await ctx.admin.from('garage_vehicles').delete().eq('id', vehicle_id);
      if (error) throw Object.assign(new Error('Could not delete this vehicle.'), { status: 503 });
      if (photos?.length) await ctx.admin.storage.from('garage-photos').remove(photos.flatMap(p => [p.storage_path, p.display_path].filter(Boolean))).catch(() => {});
      return json({ ok: true, message: 'Vehicle deleted.' });
    }
    if (action === 'delete_service') {
      const service_id = clean(b.service_id, 80);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(service_id)) throw Object.assign(new Error('Choose a service.'), { status: 400 });
      const { data: row, error: rowError } = await ctx.admin.from('garage_services').select('id,vehicle_id').eq('id', service_id).maybeSingle();
      if (rowError) throw Object.assign(new Error('Could not find this service. Try again.'), { status: 503 });
      if (!row) throw Object.assign(new Error('Service not found.'), { status: 404 });
      const { error } = await ctx.admin.from('garage_services').delete().eq('id', service_id);
      if (error) throw Object.assign(new Error('Could not delete this service.'), { status: 503 });
      return json({ ok: true, vehicle_id: row.vehicle_id, message: 'Service deleted.' });
    }
    if (action === 'set_contact') {
      const customer_id = clean(b.customer_id, 80), phone = String(b.phone || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(customer_id)) throw Object.assign(new Error('Choose a client.'), { status: 400 });
      if (phone && phone.length !== 10) throw Object.assign(new Error('Enter a 10-digit phone number.'), { status: 400 });
      const { error } = await ctx.admin.from('garage_profiles').update({ phone: phone || null }).eq('user_id', customer_id);
      if (error) throw Object.assign(new Error('Could not save the phone number. Run the client phone update in Supabase first.'), { status: 503 });
      return json({ ok: true, message: 'Phone number saved.' });
    }
    if (action === 'delete_logo') {
      const customer_id = clean(b.customer_id, 80);
      const { data: prof } = await ctx.admin.from('garage_profiles').select('logo_path').eq('user_id', customer_id).maybeSingle();
      const { error } = await ctx.admin.from('garage_profiles').update({ logo_path: null }).eq('user_id', customer_id);
      if (error) throw Object.assign(new Error('Could not remove the logo.'), { status: 503 });
      if (prof?.logo_path) await ctx.admin.storage.from('garage-photos').remove([prof.logo_path]).catch(() => {});
      return json({ ok: true, message: 'Logo removed.' });
    }
    if (action === 'make_display_copies') {
      // One-time catch-up for photos saved before smaller copies existed. Works in small batches.
      const { data: rows, error: rErr } = await ctx.admin.from('garage_photos').select('id,vehicle_id,storage_path').is('display_path', null).order('created_at', { ascending: true }).limit(20);
      if (rErr) throw Object.assign(new Error('Could not list photos. Check the Garage database update.'), { status: 503 });
      let done = 0, failed = 0;
      for (const row of rows || []) {
        try {
          const { data: file, error: dlErr } = await ctx.admin.storage.from('garage-photos').download(row.storage_path);
          if (dlErr || !file) throw new Error('download');
          const small = await displayCopy(Buffer.from(await file.arrayBuffer()));
          if (!small) throw new Error('resize');
          const display_path = `${row.vehicle_id}/display-${row.storage_path.split('/')[1].replace(/^cutout-/, '')}`;
          const { error: upErr } = await ctx.admin.storage.from('garage-photos').upload(display_path, small, { contentType: 'image/webp', upsert: true });
          if (upErr) throw new Error('upload');
          const { error: saveErr } = await ctx.admin.from('garage_photos').update({ display_path }).eq('id', row.id);
          if (saveErr) throw new Error('save');
          done++;
        } catch { failed++; }
      }
      const { count } = await ctx.admin.from('garage_photos').select('id', { count: 'exact', head: true }).is('display_path', null);
      return json({ ok: true, done, failed, remaining: count ?? 0, message: `Made ${done} faster ${done === 1 ? 'copy' : 'copies'}.${failed ? ` ${failed} could not be converted.` : ''}` });
    }
    if (action === 'delete_photo') {
      const photo_id = clean(b.photo_id, 80);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(photo_id)) throw Object.assign(new Error('Choose a photo.'), { status: 400 });
      const { data: photo, error: pErr } = await ctx.admin.from('garage_photos').select('id,vehicle_id,storage_path,display_path').eq('id', photo_id).maybeSingle();
      if (pErr) throw Object.assign(new Error('Could not find this photo. Try again.'), { status: 503 });
      if (!photo) throw Object.assign(new Error('Photo not found.'), { status: 404 });
      // Clear either cover first so the vehicle never points at a deleted photo.
      const { error: heroError } = await ctx.admin.from('garage_vehicles').update({ hero_photo_id: null }).eq('id', photo.vehicle_id).eq('hero_photo_id', photo.id);
      if (!heroError) await ctx.admin.from('garage_vehicles').update({ mobile_hero_photo_id: null }).eq('id', photo.vehicle_id).eq('mobile_hero_photo_id', photo.id);
      if (heroError) throw Object.assign(new Error('Could not remove this photo as the cover. Nothing was deleted.'), { status: 503 });
      const { error } = await ctx.admin.from('garage_photos').delete().eq('id', photo.id);
      if (error) throw Object.assign(new Error('Could not delete this photo.'), { status: 503 });
      await ctx.admin.storage.from('garage-photos').remove([photo.storage_path, photo.display_path].filter(Boolean)).catch(() => {});
      return json({ ok: true, vehicle_id: photo.vehicle_id, photo_id: photo.id, message: 'Photo deleted.' });
    }
    if (action === 'record_service') {
      const vehicle_id = clean(b.vehicle_id, 80), service_date = clean(b.service_date, 10), title = clean(b.title, 140);
      if (!vehicle_id || !/^\d{4}-\d{2}-\d{2}$/.test(service_date) || service_date > easternToday() || !title) throw Object.assign(new Error('Enter the vehicle, completed service date, and service name.'), { status: 400 });
      const { data: sameDay, error: dupError } = await ctx.admin.from('garage_services').select('id,title').eq('vehicle_id', vehicle_id).eq('service_date', service_date);
      if (dupError) throw Object.assign(new Error('Could not check existing services. Try again.'), { status: 503 });
      if ((sameDay || []).some(x => x.title.trim().toLowerCase() === title.trim().toLowerCase())) throw Object.assign(new Error('This service is already recorded for this vehicle on that date.'), { status: 409 });
      const applied = b.paint_sealant === true;
      const { data, error } = await ctx.admin.rpc('garage_record_service', {
        p_vehicle_id: vehicle_id, p_service_date: service_date, p_title: title,
        p_description: clean(b.description, 1500) || null,
        p_paint_sealant: applied,
        p_ceramic_coating: b.ceramic_coating === true,
        p_leather_protection: b.leather_protection === true,
        p_fabric_protection: b.fabric_protection === true,
      });
      if (error) throw Object.assign(new Error('Could not save service. Apply the Supabase Garage schema migration first.'), { status: 503 });
      const result = Array.isArray(data) ? data[0] : data;
      return json({ ok: true, service: result });
    }
    if (action === 'set_hero') {
      const { data: photo, error: pErr } = await ctx.admin.from('garage_photos').select('id,vehicle_id').eq('id', b.photo_id).single();
      if (pErr || !photo) throw Object.assign(new Error('Photo not found.'), { status: 404 });
      const mobile = b.cover === 'mobile';
      const { error } = await ctx.admin.from('garage_vehicles').update(mobile ? { mobile_hero_photo_id: photo.id } : { hero_photo_id: photo.id }).eq('id', photo.vehicle_id);
      if (error) throw Object.assign(new Error('Could not set vehicle cover photo.'), { status: 503 });
      // A cover stays on Home; it starts hidden from My Garage so the same image is not listed twice.
      await ctx.admin.from('garage_photos').update({ show_on_garage: false }).eq('id', photo.id);
      return json({ ok: true, vehicle_id: photo.vehicle_id, hero_photo_id: photo.id, cover: mobile ? 'mobile' : 'desktop' });
    }
    if (action === 'appointment') {
      const vehicle_id = clean(b.vehicle_id, 80), service_label = clean(b.service_label, 140);
      const starts_at = new Date(b.starts_at);
      if (!vehicle_id || !service_label || !Number.isFinite(starts_at.getTime())) throw Object.assign(new Error('Enter a vehicle, appointment date/time, and service.'), { status: 400 });
      const status = ['requested','confirmed','completed','cancelled'].includes(b.status) ? b.status : 'confirmed';
      const { data, error } = await ctx.admin.from('garage_appointments').insert({ vehicle_id, starts_at: starts_at.toISOString(), service_label, status }).select().single();
      if (error) throw Object.assign(new Error('Could not save appointment.'), { status: 400 });
      return json({ ok: true, appointment: data });
    }
    throw Object.assign(new Error('Unknown admin action.'), { status: 400 });
  } catch (e) { return responseError(e); }
};

async function savedPhotoResponse(admin, data, {isCutout, warning, isHero, coverFor='desktop', reused=false}) {
  const warnings=warning?[warning]:[];
  let coverSaved=false;
  if (isHero) {
    const column=coverFor==='mobile'?'mobile_hero_photo_id':'hero_photo_id';
    const {error:heroError}=await admin.from('garage_vehicles').update({ [column]: data.id }).eq('id', data.vehicle_id);
    coverSaved=!heroError;
    if(!heroError) await admin.from('garage_photos').update({ show_on_garage: false }).eq('id', data.id);
    if(heroError)warnings.push('Photo saved to gallery. Tap USE AS COVER on the saved photo to retry the cover without uploading again.');
  }
  let url=null;
  try {const signed=await admin.storage.from('garage-photos').createSignedUrl(data.display_path||data.storage_path,900);url=signed.data?.signedUrl||null;} catch { /* Saving succeeded even if the preview is unavailable. */ }
  if(!url)warnings.push('Photo saved. Its private preview could not load; refresh to try again.');
  const {storage_path:privatePath,...savedPhoto}=data;
  return json({ok:true,photo:{...savedPhoto,is_cutout:isCutout,url},cover_saved:coverSaved,reused,warning:warnings.join(' ')||null});
}

exports.photoPost = async req => {
  try {
    const ctx = await requireAdmin(await customerContext(req));
    const form = await req.formData();
    const vehicle_id = clean(form.get('vehicle_id'), 80), kind = clean(form.get('kind'), 20);
    const file = form.get('file');
    const uploadId=clean(form.get('upload_id'),80);
    if(uploadId&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uploadId))throw Object.assign(new Error('Choose the photo again to start a new upload.'),{status:400});
    if (!vehicle_id || !file || typeof file.arrayBuffer !== 'function') throw Object.assign(new Error('Choose a vehicle and photo.'), { status: 400 });
    if (!file.size || file.size > 4 * 1024 * 1024) throw Object.assign(new Error('This photo could not be prepared. Choose it again to resize it automatically.'), { status: 400 });
    const { data: vehicle, error: vErr } = await ctx.admin.from('garage_vehicles').select('id').eq('id', vehicle_id).single();
    if (vErr || !vehicle) throw Object.assign(new Error('Vehicle not found.'), { status: 404 });
    // Retries keep the same upload ID, including after a lost success response.
    // The existing unique storage_path gives us persistence without another table.
    if(uploadId){
      const {data:existing,error:lookupError}=await ctx.admin.from('garage_photos').select('*').eq('vehicle_id',vehicle_id).in('storage_path',[`${vehicle_id}/${uploadId}.webp`,`${vehicle_id}/cutout-${uploadId}.webp`]).maybeSingle();
      if(lookupError)throw Object.assign(new Error('Could not check whether this photo was already saved. Retry in a moment.'),{status:503});
      if(existing)return await savedPhotoResponse(ctx.admin,existing,{isCutout:/\/cutout-/.test(existing.storage_path),isHero:form.get('is_hero')==='true',coverFor:form.get('cover_for')==='mobile'?'mobile':'desktop',reused:true});
    }
    const {bytes:photoBytes,isCutout,warning}=await prepareShowroomPhoto(await file.arrayBuffer(),{removeBackground:form.get('showroom')==='true',keepFraming:form.get('keep_framing')==='true'});
    const storage_path = `${vehicle_id}/${isCutout?'cutout-':''}${uploadId||cryptoRandom()}.webp`;
    const { error: upErr } = await ctx.admin.storage.from('garage-photos').upload(storage_path, photoBytes, { contentType: 'image/webp', upsert: false });
    if (upErr) throw Object.assign(new Error('Photo upload failed. Check that the private garage-photos bucket exists.'), { status: 503 });
    let display_path = null;
    const small = await displayCopy(photoBytes);
    if (small) {
      display_path = `${vehicle_id}/display-${storage_path.split('/')[1].replace(/^cutout-/, '')}`;
      const { error: dErr } = await ctx.admin.storage.from('garage-photos').upload(display_path, small, { contentType: 'image/webp', upsert: false });
      if (dErr) display_path = null;
    }
    const { data, error } = await ctx.admin.from('garage_photos').insert({ vehicle_id, storage_path, display_path, caption: clean(form.get('caption'), 160) || null, photo_kind: ['hero', 'before', 'after', 'gallery'].includes(kind) ? kind : 'gallery' }).select().single();
    if (error) { await ctx.admin.storage.from('garage-photos').remove([storage_path, display_path].filter(Boolean)); throw Object.assign(new Error('Could not save photo details.'), { status: 503 }); }
    return await savedPhotoResponse(ctx.admin,data,{isCutout,warning,isHero:form.get('is_hero')==='true',coverFor:form.get('cover_for')==='mobile'?'mobile':'desktop'});
  } catch (e) { return responseError(e); }
};

exports.logoPost = async req => {
  try {
    const ctx = await requireAdmin(await customerContext(req));
    const form = await req.formData();
    const customer_id = clean(form.get('customer_id'), 80), file = form.get('file');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(customer_id) || !file || typeof file.arrayBuffer !== 'function') throw Object.assign(new Error('Choose a client and a logo file.'), { status: 400 });
    if (!file.size || file.size > 2 * 1024 * 1024) throw Object.assign(new Error('Choose a logo under 2 MB.'), { status: 400 });
    const { data: prof, error: pErr } = await ctx.admin.from('garage_profiles').select('*').eq('user_id', customer_id).maybeSingle();
    if (pErr || !prof) throw Object.assign(new Error('Client not found.'), { status: 404 });
    let bytes;
    try { bytes = await require('sharp')(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 50_000_000, failOn: 'error' }).rotate().resize({ width: 1200, height: 400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 90, alphaQuality: 100 }).toBuffer(); }
    catch { throw Object.assign(new Error('That logo could not be read. Use a PNG, JPG or WebP.'), { status: 400 }); }
    const path = `logos/${customer_id}-${cryptoRandom()}.webp`;
    const { error: upErr } = await ctx.admin.storage.from('garage-photos').upload(path, bytes, { contentType: 'image/webp', upsert: false });
    if (upErr) throw Object.assign(new Error('Logo upload failed. Check that the private garage-photos bucket exists.'), { status: 503 });
    const { error } = await ctx.admin.from('garage_profiles').update({ logo_path: path }).eq('user_id', customer_id);
    if (error) { await ctx.admin.storage.from('garage-photos').remove([path]).catch(() => {}); throw Object.assign(new Error('Could not save the logo. Run the Garage health update in Supabase first.'), { status: 503 }); }
    if (prof.logo_path) await ctx.admin.storage.from('garage-photos').remove([prof.logo_path]).catch(() => {});
    const url = (await ctx.admin.storage.from('garage-photos').createSignedUrl(path, 900)).data?.signedUrl || null;
    return json({ ok: true, logo_url: url, message: 'Logo saved.' });
  } catch (e) { return responseError(e); }
};

exports.reminderPost = async req => {
  try {
    const secret = process.env.GARAGE_REMINDER_SECRET;
    if (!secret || req.headers.get('x-garage-webhook-key') !== secret) throw Object.assign(new Error('Not authorized.'), { status: 401 });
    const b = await req.json();
    const cycleId = clean(b.cycle_id, 80), type = clean(b.message_type, 30);
    if (!cycleId || !['month1_offer','month3_due'].includes(type)) throw Object.assign(new Error('Invalid reminder event.'), { status: 400 });
    const { url, secret: serviceKey } = config();
    const admin = createClient(url, serviceKey, { auth: { persistSession:false, autoRefreshToken:false } });
    const { data: cycle, error } = await admin.from('garage_maintenance_cycles').select('*,garage_vehicles!inner(id,year,make,model,customer_id)').eq('id',cycleId).eq('status','active').single();
    if (error || !cycle) return json({ sent:false, reason:'cycle_inactive' });
    const today = easternToday();
    const due = type === 'month1_offer' ? cycle.offer_date <= today && cycle.offer_expires_at >= today : cycle.sealant_expires_at <= today;
    if (!due) return json({ sent:false, reason:'not_due' });
    if (type === 'month1_offer') {
      const { data: offer } = await admin.from('garage_offers').select('id,status').eq('cycle_id',cycle.id).single();
      if (!offer || offer.status !== 'available') return json({ sent:false, reason:'offer_unavailable' });
    }
    const templateId = Number(type === 'month1_offer' ? process.env.BREVO_MONTH1_TEMPLATE_ID : process.env.BREVO_MONTH3_TEMPLATE_ID);
    const apiKey = process.env.BREVO_API_KEY;
    if (!templateId || !apiKey) throw Object.assign(new Error('Brevo email templates are not configured.'), { status:503 });
    const { data: customer, error: cErr } = await admin.from('garage_profiles').select('email,display_name').eq('user_id',cycle.garage_vehicles.customer_id).single();
    if (cErr || !customer?.email) throw Object.assign(new Error('Customer email is missing.'), { status:503 });
    const { data: deliveryId, error: claimError } = await admin.rpc('garage_claim_email_delivery',{p_cycle_id:cycle.id,p_message_type:type});
    if (claimError) throw Object.assign(new Error('Could not reserve this reminder for delivery.'), { status:503 });
    if (!deliveryId) return json({ sent:false, reason:'already_claimed' });
    const vehicle = vehicleLabel(cycle.garage_vehicles);
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.vvmdetails.com').replace(/\/$/,'');
    const { data: currentCycle } = await admin.from('garage_maintenance_cycles').select('status').eq('id',cycle.id).single();
    if (currentCycle?.status !== 'active') {
      await admin.from('garage_email_deliveries').update({status:'cancelled'}).eq('id',deliveryId);
      return json({sent:false,reason:'cycle_inactive'});
    }
    const { data: emailOffer } = await admin.from('garage_offers').select('coupon_code').eq('cycle_id',cycle.id).eq('status','available').maybeSingle();
    let definitelyRejected = false;
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', { method:'POST', signal:AbortSignal.timeout(20000), headers:{'api-key':apiKey,'content-type':'application/json'}, body:JSON.stringify({ to:[{email:customer.email,name:customer.display_name}], templateId, headers:{idempotencyKey:deliveryId}, params:{ FIRSTNAME:(customer.display_name||'').split(/\s+/)[0]||'there', VEHICLE:vehicle, OFFER_EXPIRATION_DATE:cycle.offer_expires_at, OFFER_DISCOUNT:'50%', OFFER_SAVINGS:'over $145', SEALANT_ESTIMATED_END:cycle.sealant_expires_at, GARAGE_URL:`${siteUrl}/garage`, BOOKING_URL:`${siteUrl}/${emailOffer ? `?coupon=${encodeURIComponent(emailOffer.coupon_code)}` : ''}#book`, OFFER_CODE:emailOffer?.coupon_code||'' } }) });
      const result = await response.json().catch(()=>({}));
      if (!response.ok) {
        definitelyRejected = response.status >= 400 && response.status < 500 && response.status !== 408 && result.code !== 'duplicate_parameter';
        throw new Error(`Brevo response ${response.status}.`);
      }
      const {error:saveError} = await admin.from('garage_email_deliveries').update({ status:'sent', provider_message_id:result.messageId||null, sent_at:new Date().toISOString() }).eq('id',deliveryId);
      if(saveError) throw new Error('Delivery acknowledgement could not be saved.');
      return json({ sent:true });
    } catch (e) {
      // Ambiguous outcomes stay queued for manual provider reconciliation, never a blind daily retry.
      await admin.from('garage_email_deliveries').update({ status:definitelyRejected?'failed':'queued', error:clean(`${definitelyRejected?'Rejected':'Needs review: delivery outcome unknown'}. ${e.message}`,300) }).eq('id',deliveryId);
      throw Object.assign(new Error('Brevo could not send this reminder.'), { status:502 });
    }
  } catch (e) { return responseError(e); }
};

exports.remindersCronGet = async req => {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) throw Object.assign(new Error('Not authorized.'), { status:401 });
    const { url, secret: serviceKey } = config();
    const admin = createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:pending,error:queueError} = await admin.rpc('garage_pending_reminders',{p_limit:100});
    if(queueError) {
      // Provider messages can include malformed credential/header values. Never log their text.
      console.error('Garage reminder queue failed', {code:/^[A-Z0-9_]{1,20}$/.test(queueError.code||'')?queueError.code:'REQUEST_FAILED'});
      throw Object.assign(new Error('Could not find due Garage reminders.'),{status:503});
    }
    const results=[];
    const deadline=Date.now()+40000;
    for(const item of pending||[]){
      if(Date.now()>deadline) break;
      const result=await exports.reminderPost(new Request('https://garage.internal/api/garage/reminder',{method:'POST',headers:{'content-type':'application/json','x-garage-webhook-key':process.env.GARAGE_REMINDER_SECRET||''},body:JSON.stringify(item)}));
      results.push({type:item.message_type,status:result.status,body:await result.json()});
    }
    return json({processed:results.length,results});
  } catch(e){return responseError(e)}
};

function cryptoRandom() { return require('crypto').randomUUID(); }

module.exports = { customerGet: exports.customerGet, adminGet: exports.adminGet, adminPost: exports.adminPost, photoPost: exports.photoPost, logoPost: exports.logoPost, reminderPost: exports.reminderPost, remindersCronGet: exports.remindersCronGet };
