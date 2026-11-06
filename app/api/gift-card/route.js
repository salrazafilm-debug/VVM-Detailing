import gifts from '../../../server/gift-cards.js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const reply = (e) => Response.json({ error: e.status && e.status < 500 ? e.message : (e.status === 503 || e.status === 502 ? e.message : 'Something went wrong. Please text us at (240) 601-9451.') }, { status: e.status || 500 });
export async function POST(req) {
  try { const b = await req.json().catch(() => ({})); if (b.website) return Response.json({ ok: true }); return Response.json(await gifts.create(b)); }
  catch (e) { console.error('gift card create failed:', e.message); return reply(e); }
}
export async function GET(req) {
  try { return Response.json(await gifts.status(new URL(req.url).searchParams.get('gift')), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (e) { return reply(e); }
}
