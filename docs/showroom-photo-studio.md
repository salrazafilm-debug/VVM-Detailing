# Client showroom and vehicle photo workflow

After client login, `/garage` opens the pink showroom. The room is a shared static background; the displayed vehicle comes only from that account’s selected vehicle cover. No client image or no vehicle means an empty room. Home, Services, My Garage, Bookings, Profile and Special Offer are working controls. Prices come from the existing services API; bookings and offers link to the existing booking flow. No active offer means a clear empty offer state.

Private photos continue to use short-lived signed storage links. The client page refreshes them every ten minutes and when the page becomes visible again. Services, photos, appointments and protection are loaded from real Garage records. Only requested/confirmed upcoming appointments are displayed.

## Set up a client

1. Sign in at `/admin`, then select the client in Garage Admin.
2. Select the vehicle and upload its photo. Use **Use as their Garage cover**.
3. A transparent PNG/WebP is recognized, trimmed, resized and placed in the showroom automatically. Gallery photos remain private.
4. For an ordinary photo, enable **Automatically remove the background for the showroom** when available. It uses the configured remove.bg account and credits. This option is off until the administrator selects it. Existing cutouts do not use removal credits. Failed/unavailable removal still saves the regular photo; the client can see it in a framed photo view until a cutout is prepared.
5. Use **Open client Garage** to preview the selected client through authenticated admin access. Customers cannot use the preview query to read another account. Profile password changes are hidden while previewing another client.

The implementation never assigns a truck by matching a display name: choose the exact client and vehicle. Test fixtures and generated truck previews are not inserted into live client records.

## Consistent vehicle photos

- Shoot a front three-quarter view, roughly 30–45 degrees off the front. Use the same side for every vehicle.
- Keep the camera level around headlight height. Use the phone’s normal 1× camera rather than ultra-wide.
- Stand back until the whole vehicle, mirrors and wheels fit, with about 10–15% space around all edges. Landscape is preferable.
- Use soft daylight or open shade, a clean uncluttered background and a sharp original photo. Keep people and identifying location details out of frame.

Background removal preserves the original vehicle angle, wheels, body shape and trim. The site does not invent a new camera angle. AI angle changes may alter vehicle details; if used externally, inspect the result before uploading. Consistent original photos are the most reliable option.

## Showroom Photo Studio

Open the optional **Showroom photo studio** section for the selected vehicle. Upload a transparent cutout or remove its background. The preview uses the same pink room as the client homepage. Adjust size and position, then **Approve & Save**. The saved cover contains only the vehicle on transparency, with its framing; it does not bake the room, buttons or navigation into the photo. Existing gallery images remain available.

For automatic removal, set the server-only `REMOVE_BG_API_KEY` in Vercel and redeploy. The admin interface shows whether it is available. Never add the key to a `NEXT_PUBLIC_` variable. The removal endpoint and upload endpoint require an authenticated Garage administrator. No SQL migration is required for this showroom update.

Uploads are prepared in the browser, including HEIC decoding when needed, and validated/re-encoded as WebP on the server. Phone rotation is applied and EXIF/GPS metadata is removed. Stored cutout filenames carry a marker so the client can compose them without changing the database schema. Regular photos remain compatible. The browser also recognizes older transparent cover photos.
