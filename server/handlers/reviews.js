// Google reviews for the Reviews section. Needs two Vercel env vars (the owner sets them):
//   GOOGLE_PLACES_API_KEY  (Google Cloud, Places API (New) turned on)
//   GOOGLE_PLACE_ID        (the Google Business Profile place id)
// Without them this returns { google: null } and the page shows only the owner's own reviews (reviews.json).
// Google's answer is cached for 6 hours so the API is called only a few times a day. Any failure fails open.
let cache = { at: 0, data: null };
const TTL = 6 * 3600 * 1000;
const FIELDS = 'rating,userRatingCount,googleMapsUri,reviews.rating,reviews.text,reviews.originalText,reviews.relativePublishTimeDescription,reviews.authorAttribution.displayName';

const reply = google => ({
  statusCode: 200,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=1800' },
  body: JSON.stringify({ google }),
});

exports.handler = async () => {
  const key = process.env.GOOGLE_PLACES_API_KEY, id = process.env.GOOGLE_PLACE_ID;
  if (!key || !id) return reply(null);
  if (cache.data && Date.now() - cache.at < TTL) return reply(cache.data);
  try {
    const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, {
      headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELDS },
    });
    if (!r.ok) throw new Error('Places API ' + r.status);
    const p = await r.json();
    const data = {
      rating: p.rating || null,
      count: p.userRatingCount || 0,
      url: p.googleMapsUri || null,
      // every review Google returns is shown as is (no picking and choosing)
      reviews: (p.reviews || []).map(v => ({
        name: (v.authorAttribution && v.authorAttribution.displayName) || 'Google reviewer',
        rating: v.rating || 5,
        text: ((v.originalText && v.originalText.text) || (v.text && v.text.text) || '').slice(0, 600),
        when: v.relativePublishTimeDescription || '',
      })).filter(v => v.text),
    };
    cache = { at: Date.now(), data };
    return reply(data);
  } catch (e) {
    console.error('reviews:', e.message);
    return reply(cache.data || null);
  }
};
