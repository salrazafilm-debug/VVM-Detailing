import handlers from '../../../server/handlers/services.js';
import adapt from '../../../server/adapt.js';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  return adapt.toResponse(await handlers.handler(await adapt.toEvent(req)));
}
