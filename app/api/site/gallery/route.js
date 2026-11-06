import gallery from '../../../../server/site-gallery.js';
export const dynamic = 'force-dynamic';
export async function GET() { return gallery.publicGet(); }
