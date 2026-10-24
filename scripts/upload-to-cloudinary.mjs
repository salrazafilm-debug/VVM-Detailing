// Uploads public/assets images to Cloudinary under vvm/. Run: node --env-file=.env.local scripts/upload-to-cloudinary.mjs
import fs from 'node:fs';
import path from 'node:path';
import { cloudinaryUpload, cloudinaryConfigured } from '../server/cloudinary.js';

if (!cloudinaryConfigured()) { console.error('Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in .env.local first.'); process.exit(1); }
const root = 'public/assets';
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!/garage|fonts/.test(e.name)) walk(p); } else if (/\.(jpe?g|png|webp)$/i.test(e.name)) files.push(p); } })(root);
for (const f of files) {
  const id = 'vvm/' + path.relative(root, f).replace(/\\/g, '/').replace(/\.[^.]+$/, '');
  const r = await cloudinaryUpload(fs.readFileSync(f), id);
  console.log('uploaded', r.public_id);
}
