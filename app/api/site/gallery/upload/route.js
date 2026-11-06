import gallery from '../../../../../server/site-gallery.js';
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export async function POST(req) { return gallery.uploadPost(req); }
