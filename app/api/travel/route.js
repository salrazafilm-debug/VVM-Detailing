import { lookupZip } from '../../../server/travel.js';

export const dynamic = 'force-dynamic';

// GET /api/travel?zip=20732 -> travel fee, family area and drive-time estimate for a ZIP code. No address is stored.
export async function GET(req) {
  const zip = new URL(req.url).searchParams.get('zip');
  const result = lookupZip(zip);
  return Response.json(result, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
