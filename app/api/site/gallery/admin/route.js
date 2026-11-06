import gallery from '../../../../../server/site-gallery.js';
export const dynamic = 'force-dynamic';
export async function GET(req) { return gallery.adminGet(req); }
export async function POST(req) { return gallery.adminPost(req); }
