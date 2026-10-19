# Showroom Photo Studio

Open Garage Admin and scroll to Showroom Photo Studio. Select the customer vehicle, choose a JPEG/PNG/WebP, click Remove Background, adjust size and position, then Approve & Save. A transparent PNG can skip removal. The cover is saved privately in the existing Supabase bucket. No SQL migration is required.

For automatic removal, add `REMOVE_BG_API_KEY` as a server-only Vercel environment variable and redeploy. Use a remove.bg account with available credits. Images are sent to remove.bg only when the administrator clicks Remove Background. Never add the key to NEXT_PUBLIC variables. The processing endpoint requires an authenticated Garage administrator.

Use a complete, unobstructed front three-quarter photo. This feature preserves the source angle; it does not generate a new angle or reconstruct hidden vehicle details. Preview edges before approval. Use an externally prepared transparent PNG when automatic segmentation needs corrections. Source metadata is removed during canvas export. Original uploads are not automatically saved; retain your source separately if needed.

Interior gallery discovery currently uses the word “Interior” in the uploaded photo caption. The interior button appears only when a matching photo has a usable URL.
