// Turns a Next.js request into the event shape the handlers were written for, and their reply back into a Response.
async function toEvent(req) {
  const url = new URL(req.url);
  return {
    httpMethod: req.method,
    headers: Object.fromEntries(req.headers.entries()),
    queryStringParameters: Object.fromEntries(url.searchParams.entries()),
    body: req.method === 'GET' ? '' : await req.text(),
  };
}

function toResponse(r) {
  return new Response(r.body, { status: r.statusCode, headers: r.headers });
}

module.exports = { toEvent, toResponse };
