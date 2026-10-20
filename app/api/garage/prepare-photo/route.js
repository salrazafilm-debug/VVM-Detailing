import auth from '../../../../server/garage-auth.js';
import showroom from '../../../../server/garage-showroom.js';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(req) {
  try {
    await auth.requireAdmin(await auth.customerContext(req));
    if (!process.env.REMOVE_BG_API_KEY) return Response.json({error:'Automatic removal needs REMOVE_BG_API_KEY in Vercel. You can also upload a transparent PNG.'},{status:503});
    const input = await req.formData();
    const file = input.get('file');
    if (!file || !['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 4*1024*1024) return Response.json({error:'Choose a JPEG, PNG or WebP smaller than 4 MB.'},{status:400});
    const bytes = await showroom.removeVehicleBackground(await file.arrayBuffer(),file.type);
    return new Response(bytes,{headers:{'Content-Type':'image/png','Cache-Control':'no-store'}});
  } catch(e) { if(e.status===502)return Response.json({error:e.message},{status:502});return auth.responseError(e); }
}
