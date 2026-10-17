import garage from '../../../server/garage-api.js';
export const dynamic = 'force-dynamic';
export async function GET(req) { return garage.customerGet(req); }
