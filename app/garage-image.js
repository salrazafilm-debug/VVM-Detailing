'use client';

const MAX_INPUT = 20 * 1024 * 1024;
const MAX_UPLOAD = 3 * 1024 * 1024; // Leave room for multipart fields on Vercel.

async function nativeImage(blob) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch {}
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally { URL.revokeObjectURL(url); }
}

export async function openGarageImage(file) {
  if (!file || !file.size) throw new Error('Choose a photo first.');
  if (file.size > MAX_INPUT) throw new Error('Choose a photo smaller than 20 MB.');
  try { return await nativeImage(file); } catch {}
  // Load the phone-photo decoder only when the browser cannot open HEIC itself.
  const header = new TextDecoder().decode(await file.slice(0, 64).arrayBuffer());
  const isHeic = /heic|heif/i.test(file.type || '') || /\.(heic|heif)$/i.test(file.name || '') || /ftyp(?:heic|heix|hevc|hevx|mif1|msf1)/.test(header);
  if (isHeic) {
    try {
      const { heicTo } = await import('heic-to/csp');
      return await nativeImage(await heicTo({ blob: file, type: 'image/png' }));
    } catch {}
  }
  throw new Error('This photo could not be opened. Choose another JPEG, PNG, WebP or HEIC photo.');
}

function encode(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not prepare this photo. Try another image.')), type, quality));
}

export async function exportGarageCanvas(canvas) {
  for (let sizeAttempt = 0; sizeAttempt < 5; sizeAttempt++) {
    for (const quality of [0.86, 0.74, 0.62]) {
      let blob = await encode(canvas, 'image/webp', quality);
      // The server also converts JPEG if an older browser cannot export WebP.
      if (blob.type !== 'image/webp') blob = await encode(canvas, 'image/jpeg', quality);
      if (blob.size <= MAX_UPLOAD) return blob;
    }
    const smaller = document.createElement('canvas');
    smaller.width = Math.max(1, Math.round(canvas.width * 0.75));
    smaller.height = Math.max(1, Math.round(canvas.height * 0.75));
    smaller.getContext('2d').drawImage(canvas, 0, 0, smaller.width, smaller.height);
    canvas = smaller;
  }
  throw new Error('This photo could not be compressed. Try a different image.');
}

export async function prepareGaragePhoto(file) {
  const image = await openGarageImage(file);
  try {
    const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
    const ratio = Math.min(1, 1800 / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return await exportGarageCanvas(canvas);
  } finally { image.close?.(); }
}
