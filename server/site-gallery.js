// Homepage "Our Work" photos, managed from admin (Homepage tab). Nothing changes on the site until the owner taps
// CONFIRM: admin keeps the working list on the screen, uploads only store files, and save_gallery publishes the list.
// Until the first CONFIRM the homepage keeps the photos written in public/index.html (gallery-seed.json is a copy).
const { createClient } = require('@supabase/supabase-js');
const { customerContext, requireAdmin, responseError, config } = require('./garage-auth');
const SEED = require('./gallery-seed.json');

const json = (data, status = 200, headers) => Response.json(data, { status, headers });
const BUCKET = 'site-photos';
const MAX_ITEMS = 60;
const clean = (s, max) => String(s || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

function adminDb() {
  const { url, secret } = config();
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Only our own photo hosts may appear on the homepage.
function allowedSrc(src) {
  try {
    const u = new URL(src);
    if (u.protocol !== 'https:') return false;
    if (u.hostname === 'res.cloudinary.com' && u.pathname.startsWith('/kwsr06pq/')) return true;
    const base = new URL(config().url);
    return u.hostname === base.hostname && u.pathname.startsWith(`/storage/v1/object/public/${BUCKET}/`);
  } catch { return false; }
}

// Checks and tidies the list the owner confirmed. Throws a 400 with a plain message when something is off.
function validItems(raw) {
  if (!Array.isArray(raw) || !raw.length) throw Object.assign(new Error('Keep at least one photo.'), { status: 400 });
  if (raw.length > MAX_ITEMS) throw Object.assign(new Error(`Use ${MAX_ITEMS} photos or fewer.`), { status: 400 });
  return raw.map(it => {
    const width = Math.round(Number(it?.width)), height = Math.round(Number(it?.height));
    if (!allowedSrc(it?.src) || !(width > 0 && width <= 6000) || !(height > 0 && height <= 6000)) throw Object.assign(new Error('One of the photos is not valid. Remove it and try again.'), { status: 400 });
    return { src: String(it.src), alt: clean(it.alt, 140) || 'A car detailed by VVM Details', width, height };
  });
}

async function published(db) {
  const { data, error } = await db.from('site_gallery').select('items,updated_at').eq('id', 'home').maybeSingle();
  if (error) return { items: null, error };
  return { items: Array.isArray(data?.items) && data.items.length ? data.items : null, updated_at: data?.updated_at || null };
}

// Public: the confirmed list, or null so the homepage keeps its built-in photos.
exports.publicGet = async () => {
  try {
    const r = await published(adminDb());
    return json({ items: r.items }, 200, { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' });
  } catch { return json({ items: null }, 200, { 'Cache-Control': 'public, s-maxage=60' }); }
};

exports.adminGet = async req => {
  try {
    const ctx = await requireAdmin(await customerContext(req));
    const r = await published(ctx.admin);
    if (r.error) return json({ items: SEED, seed: true, setup_needed: true });
    return json({ items: r.items || SEED, seed: !r.items, updated_at: r.updated_at || null });
  } catch (e) { return responseError(e); }
};

exports.adminPost = async req => {
  try {
    const ctx = await requireAdmin(await customerContext(req));
    const b = await req.json().catch(() => ({}));
    if (b.action !== 'save_gallery') throw Object.assign(new Error('Unknown action.'), { status: 400 });
    const items = validItems(b.items);
    const { error } = await ctx.admin.from('site_gallery').upsert({ id: 'home', items, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) throw Object.assign(new Error('Could not save. Run the homepage photos update in Supabase first.'), { status: 503 });
    return json({ ok: true, items, message: `Homepage updated: ${items.length} photos are live.` });
  } catch (e) { return responseError(e); }
};

// Stores one photo (resized to 1300 px on the long side, WebP, no location data). It is NOT shown until CONFIRM.
exports.uploadPost = async req => {
  try {
    const ctx = await requireAdmin(await customerContext(req));
    const form = await req.formData();
    const file = form.get('file');
    if (!file || typeof file.arrayBuffer !== 'function' || !file.size) throw Object.assign(new Error('Choose a photo.'), { status: 400 });
    if (file.size > 4 * 1024 * 1024) throw Object.assign(new Error('That photo is too big. Try again (it is shrunk on your phone first).'), { status: 400 });
    let out;
    try {
      out = await require('sharp')(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 60_000_000, failOn: 'error' })
        .rotate().resize({ width: 1300, height: 1300, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer({ resolveWithObject: true });
    } catch { throw Object.assign(new Error('That photo could not be read. Use a JPG, PNG, WebP or HEIC photo.'), { status: 400 }); }
    const path = `gallery/${Date.now().toString(36)}-${require('node:crypto').randomBytes(6).toString('hex')}.webp`;
    const { error } = await ctx.admin.storage.from(BUCKET).upload(path, out.data, { contentType: 'image/webp', upsert: false, cacheControl: '31536000' });
    if (error) throw Object.assign(new Error('Upload failed. Run the homepage photos update in Supabase first.'), { status: 503 });
    const src = ctx.admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    return json({ ok: true, photo: { src, alt: clean(form.get('alt'), 140), width: out.info.width, height: out.info.height } });
  } catch (e) { return responseError(e); }
};

module.exports = { publicGet: exports.publicGet, adminGet: exports.adminGet, adminPost: exports.adminPost, uploadPost: exports.uploadPost, validItems, allowedSrc, SEED };
