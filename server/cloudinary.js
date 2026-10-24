import crypto from 'node:crypto';

// Cloudinary hosting for site images. Env: CLOUDINARY_CLOUD_NAME (public), CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET (server only).
export function cloudinaryConfigured(env = process.env) {
  return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
}

// Delivery URL with automatic format and quality. publicId has no extension, e.g. "vvm/red-audi-tt-side".
export function cloudinaryUrl(publicId, { width, env = process.env } = {}) {
  const cloud = env.CLOUDINARY_CLOUD_NAME || env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (!cloud) throw new Error('CLOUDINARY_CLOUD_NAME is not set');
  const t = ['f_auto', 'q_auto', width ? `w_${width}` : null].filter(Boolean).join(',');
  return `https://res.cloudinary.com/${cloud}/image/upload/${t}/${publicId}`;
}

// Signed upload (no SDK). file is a Buffer. Returns Cloudinary's JSON (secure_url, public_id, ...).
export async function cloudinaryUpload(file, publicId, env = process.env, fetchImpl = fetch) {
  if (!cloudinaryConfigured(env)) throw new Error('Cloudinary is not set up yet.');
  const timestamp = Math.floor(Date.now() / 1000);
  const toSign = `overwrite=true&public_id=${publicId}&timestamp=${timestamp}`;
  const signature = crypto.createHash('sha1').update(toSign + env.CLOUDINARY_API_SECRET).digest('hex');
  const form = new FormData();
  form.append('file', new Blob([file]));
  form.append('public_id', publicId);
  form.append('overwrite', 'true');
  form.append('timestamp', String(timestamp));
  form.append('api_key', env.CLOUDINARY_API_KEY);
  form.append('signature', signature);
  const res = await fetchImpl(`https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Cloudinary upload failed ${res.status}: ${data?.error?.message || 'unknown'}`);
  return data;
}
