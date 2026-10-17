const { customerContext, requireAdmin, responseError, config } = require('./garage-auth');
const { createClient } = require('@supabase/supabase-js');

const json = (data, status = 200) => Response.json(data, { status });
const clean = (s, max = 300) => String(s || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const easternToday = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

async function addPhotoUrls(admin, rows) {
  return Promise.all((rows || []).map(async row => {
    const { data } = await admin.storage.from('garage-photos').createSignedUrl(row.storage_path, 900);
    return { ...row, url: data?.signedUrl || null };
  }));
}

exports.customerGet = async req => {
  try {
    const ctx = await customerContext(req);
    const [{ data: profile, error: pErr }, { data: vehicles, error: vErr }] = await Promise.all([
      ctx.db.from('garage_profiles').select('display_name,email').eq('user_id', ctx.user.id).maybeSingle(),
      ctx.db.from('garage_vehicles').select('*').order('created_at', { ascending: true }),
    ]);
    if (pErr || vErr) throw Object.assign(new Error('Could not load your Garage.'), { status: 503 });
    const ids = (vehicles || []).map(v => v.id);
    if (!ids.length) return json({ profile: profile || { email: ctx.user.email }, vehicles: [] });
    const [sv, ph, ap, cy, offers] = await Promise.all([
      ctx.db.from('garage_services').select('*').in('vehicle_id', ids).order('service_date', { ascending: false }),
      ctx.db.from('garage_photos').select('*').in('vehicle_id', ids).order('created_at', { ascending: false }),
      ctx.db.from('garage_appointments').select('*').in('vehicle_id', ids).gte('starts_at', new Date().toISOString()).neq('status', 'cancelled').order('starts_at'),
      ctx.db.from('garage_maintenance_cycles').select('*').in('vehicle_id', ids).eq('status', 'active'),
      ctx.db.from('garage_offers').select('*').in('vehicle_id', ids).eq('status','available').lte('starts_on',easternToday()).gte('expires_at',easternToday()),
    ]);
    for (const q of [sv, ph, ap, cy, offers]) if (q.error) throw Object.assign(new Error('Could not load Garage details.'), { status: 503 });
    const photos = await addPhotoUrls(ctx.admin, ph.data);
    const payload = vehicles.map(v => ({
      ...v,
      services: sv.data.filter(x => x.vehicle_id === v.id),
      photos: photos.filter(x => x.vehicle_id === v.id),
      appointments: ap.data.filter(x => x.vehicle_id === v.id),
      cycle: cy.data.find(x => x.vehicle_id === v.id) || null,
      offer: offers.data.find(x => x.vehicle_id === v.id && x.status === 'available') || null,
    }));
    return json({ profile: profile || { email: ctx.user.email }, vehicles: payload });
  } catch (e) { return responseError(e); }
};

exports.adminGet = async req => {
  try {
    const ctx = await requireAdmin(await customerContext(req));
    const { data, error } = await ctx.admin.from('garage_profiles').select('user_id,display_name,email,created_at,garage_vehicles(id,year,make,model,created_at)').order('created_at', { ascending: false });
    if (error) throw Object.assign(new Error('Could not load customers.'), { status: 503 });
    return json({ customers: data || [] });
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
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw Object.assign(new Error('Enter a valid customer email.'), { status: 400 });
      const inviteBase = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.vvmdetails.com';
      const { data, error } = await ctx.admin.auth.admin.inviteUserByEmail(email, { data: { display_name }, redirectTo: `${inviteBase.replace(/\/$/,'')}/reset-password` });
      if (error) throw Object.assign(new Error(error.message.includes('already') ? 'This email already has an account.' : 'Could not invite this customer. Check Supabase Auth email settings.'), { status: 400 });
      const { error: pErr } = await ctx.admin.from('garage_profiles').upsert({ user_id: data.user.id, email, display_name }, { onConflict: 'user_id' });
      if (pErr) throw Object.assign(new Error('Account invited but profile setup failed. Retry from the customer list.'), { status: 503 });
      return json({ ok: true, message: 'Customer invitation sent.' });
    }
    if (action === 'create_vehicle') {
      const customer_id = clean(b.customer_id, 80);
      const year = Number(b.year);
      const make = clean(b.make, 80), model = clean(b.model, 100);
      if (!customer_id || year < 1900 || year > new Date().getFullYear() + 1 || !make || !model) throw Object.assign(new Error('Enter a valid year, make, model, and customer.'), { status: 400 });
      const { data, error } = await ctx.admin.from('garage_vehicles').insert({ customer_id, year, make, model, color: clean(b.color, 60) || null, hero_photo_id: null }).select().single();
      if (error) throw Object.assign(new Error('Could not add vehicle. Confirm the customer exists.'), { status: 400 });
      return json({ ok: true, vehicle: data });
    }
    if (action === 'record_service') {
      const vehicle_id = clean(b.vehicle_id, 80), service_date = clean(b.service_date, 10), title = clean(b.title, 140);
      if (!vehicle_id || !/^\d{4}-\d{2}-\d{2}$/.test(service_date) || service_date > easternToday() || !title) throw Object.assign(new Error('Enter the vehicle, completed service date, and service name.'), { status: 400 });
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
      const { error } = await ctx.admin.from('garage_vehicles').update({ hero_photo_id: photo.id }).eq('id', photo.vehicle_id);
      if (error) throw Object.assign(new Error('Could not set vehicle cover photo.'), { status: 503 });
      return json({ ok: true });
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

exports.photoPost = async req => {
  try {
    const ctx = await requireAdmin(await customerContext(req));
    const form = await req.formData();
    const vehicle_id = clean(form.get('vehicle_id'), 80), kind = clean(form.get('kind'), 20);
    const file = form.get('file');
    if (!vehicle_id || !file || typeof file.arrayBuffer !== 'function') throw Object.assign(new Error('Choose a vehicle and photo.'), { status: 400 });
    if (file.type !== 'image/webp' || file.size > 4 * 1024 * 1024) throw Object.assign(new Error('Photos must be resized to WebP and smaller than 4 MB.'), { status: 400 });
    const { data: vehicle, error: vErr } = await ctx.admin.from('garage_vehicles').select('id').eq('id', vehicle_id).single();
    if (vErr || !vehicle) throw Object.assign(new Error('Vehicle not found.'), { status: 404 });
    const storage_path = `${vehicle_id}/${cryptoRandom()}.webp`;
    const { error: upErr } = await ctx.admin.storage.from('garage-photos').upload(storage_path, await file.arrayBuffer(), { contentType: 'image/webp', upsert: false });
    if (upErr) throw Object.assign(new Error('Photo upload failed. Check that the private garage-photos bucket exists.'), { status: 503 });
    const { data, error } = await ctx.admin.from('garage_photos').insert({ vehicle_id, storage_path, caption: clean(form.get('caption'), 160) || null, photo_kind: ['hero', 'before', 'after', 'gallery'].includes(kind) ? kind : 'gallery' }).select().single();
    if (error) { await ctx.admin.storage.from('garage-photos').remove([storage_path]); throw Object.assign(new Error('Could not save photo details.'), { status: 503 }); }
    if (form.get('is_hero') === 'true') await ctx.admin.from('garage_vehicles').update({ hero_photo_id: data.id }).eq('id', vehicle_id);
    return json({ ok: true, photo: data });
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
    const vehicle = `${cycle.garage_vehicles.year} ${cycle.garage_vehicles.make} ${cycle.garage_vehicles.model}`;
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
      console.error('Garage reminder queue failed', {code:queueError.code,message:queueError.message});
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

module.exports = { customerGet: exports.customerGet, adminGet: exports.adminGet, adminPost: exports.adminPost, photoPost: exports.photoPost, reminderPost: exports.reminderPost, remindersCronGet: exports.remindersCronGet };
