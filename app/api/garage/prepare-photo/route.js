import auth from '../../../../server/garage-auth.js';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(req) {
  try {
    await auth.requireAdmin(await auth.customerContext(req));
    if (!process.env.REMOVE_BG_API_KEY) return Response.json({error:'Automatic removal needs REMOVE_BG_API_KEY in Vercel. You can also upload a transparent PNG.'},{status:503});
    const input = await req.formData();
    const file = input.get('file');
    if (!file || !['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 4*1024*1024) return Response.json({error:'Choose a JPEG, PNG or WebP smaller than 4 MB.'},{status:400});
    const form = new FormData();
    form.append('image_file',file); form.append('size','auto'); form.append('type','car');
    const response = await fetch('https://api.remove.bg/v1.0/removebg',{method:'POST',headers:{'X-Api-Key':process.env.REMOVE_BG_API_KEY},body:form,signal:AbortSignal.timeout(45000)});
    if (!response.ok) return Response.json({error:response.status===402?'Background-removal credits are exhausted. Add credits in remove.bg.':'Background removal failed. Check the photo and remove.bg account, then retry.'},{status:502});
    return new Response(await response.arrayBuffer(),{headers:{'Content-Type':'image/png','Cache-Control':'no-store'}});
  } catch(e) { return auth.responseError(e); }
}
