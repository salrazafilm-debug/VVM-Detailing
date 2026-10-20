const sharp = require('sharp');

// Always decode real pixels, orient phone images and export without EXIF/GPS.
async function normalizeGaragePhoto(input) {
  try {
    const source = sharp(Buffer.from(input), { limitInputPixels: 50_000_000, failOn: 'error' });
    const metadata = await source.metadata();
    if (!['jpeg', 'png', 'webp', 'heif', 'avif'].includes(metadata.format)) throw new Error('Unsupported photo.');
    const output = await source.rotate().resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 }).toBuffer();
    if (output.length > 4 * 1024 * 1024) throw new Error('Photo is too large.');
    return output;
  } catch {
    throw Object.assign(new Error('This photo could not be processed. Try another JPEG, PNG, WebP or HEIC photo.'), { status: 400 });
  }
}
module.exports = { normalizeGaragePhoto };
