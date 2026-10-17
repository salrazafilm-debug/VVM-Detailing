import garage from '../../../../server/garage-api.js';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function GET(req) { return garage.remindersCronGet(req); }
export async function POST(req) { return garage.reminderPost(req); }
