const assert = require('assert');
delete process.env.GOOGLE_PLACES_API_KEY; delete process.env.GOOGLE_PLACE_ID;
let calls = 0, mode = 'ok';
global.fetch = async (url, opts) => {
  calls++;
  if (mode === 'fail') return { ok: false, status: 403, json: async () => ({}) };
  assert.match(url, /places\.googleapis\.com\/v1\/places\/PLACE1/);
  assert.equal(opts.headers['X-Goog-Api-Key'], 'k');
  return { ok: true, json: async () => ({ rating: 4.9, userRatingCount: 23, googleMapsUri: 'https://maps.google.com/?cid=1', reviews: [
    { rating: 5, text: { text: 'Great job' }, originalText: { text: 'Great job!' }, relativePublishTimeDescription: 'a week ago', authorAttribution: { displayName: 'Sam R.' } },
    { rating: 3, text: { text: 'It was ok' }, authorAttribution: { displayName: 'Pat' } },
    { rating: 5, text: { text: '' } },
  ] }) };
};
(async () => {
  const { handler } = require('../server/handlers/reviews.js');
  // not set up yet: no Google call, page falls back to the owner's own reviews
  let r = await handler(); assert.equal(r.statusCode, 200); assert.deepEqual(JSON.parse(r.body), { google: null }); assert.equal(calls, 0);
  process.env.GOOGLE_PLACES_API_KEY = 'k'; process.env.GOOGLE_PLACE_ID = 'PLACE1';
  r = await handler(); let g = JSON.parse(r.body).google;
  assert.equal(g.rating, 4.9); assert.equal(g.count, 23); assert.equal(g.url, 'https://maps.google.com/?cid=1');
  assert.equal(g.reviews.length, 2);                                   // the empty one is dropped, the 3-star one is NOT hidden
  assert.deepEqual(g.reviews[0], { name: 'Sam R.', rating: 5, text: 'Great job!', when: 'a week ago' });
  assert.equal(g.reviews[1].rating, 3);
  // cached: a second visit does not call Google again
  await handler(); assert.equal(calls, 1);
  console.log('reviews.js tests passed');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
