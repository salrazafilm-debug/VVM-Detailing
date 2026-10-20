import garage from '../../../../server/garage-api.js';
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export async function POST(req) { return garage.logoPost(req); }
