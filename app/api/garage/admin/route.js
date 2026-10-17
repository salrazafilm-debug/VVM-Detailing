import garage from '../../../../server/garage-api.js';
export const dynamic = 'force-dynamic';
export async function GET(req) { return garage.adminGet(req); }
export async function POST(req) { return garage.adminPost(req); }
