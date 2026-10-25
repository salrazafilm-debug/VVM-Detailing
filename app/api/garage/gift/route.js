import garage from '../../../../server/garage-api.js';
export const dynamic = 'force-dynamic';
export async function POST(req) { return garage.customerPost(req); }
