import handlers from '../../../server/handlers/book.js';
import adapt from '../../../server/adapt.js';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  return adapt.toResponse(await handlers.handler(await adapt.toEvent(req)));
}
