const sharp = require('sharp');
const { normalizeGaragePhoto } = require('./garage-photo');

async function removeVehicleBackground(input, type='image/webp') {
  if (!process.env.REMOVE_BG_API_KEY) throw Object.assign(new Error('Automatic removal needs REMOVE_BG_API_KEY in Vercel. You can also upload a transparent PNG.'),{status:503});
  const form = new FormData();
  form.append('image_file',new Blob([input],{type}),'vehicle');form.append('size','auto');form.append('type','car');
  const response = await fetch('https://api.remove.bg/v1.0/removebg',{method:'POST',headers:{'X-Api-Key':process.env.REMOVE_BG_API_KEY},body:form,signal:AbortSignal.timeout(45000)});
  if(!response.ok) throw Object.assign(new Error(response.status===402?'Background-removal credits are exhausted. Add credits in remove.bg.':'Background removal failed. Check the photo and remove.bg account, then retry.'),{status:502});
  return Buffer.from(await response.arrayBuffer());
}

async function transparent(bytes) {
  const image=sharp(bytes), metadata=await image.metadata();
  if(!metadata.hasAlpha)return false;
  const stats=await image.stats(),alpha=stats.channels.at(-1);
  return alpha.min<32 && alpha.max>100;
}

async function prepareShowroomPhoto(input,{removeBackground=false,keepFraming=false}={}) {
  let bytes=await normalizeGaragePhoto(input),isCutout=await transparent(bytes),warning=null;
  if(removeBackground&&!isCutout){
    try{bytes=await normalizeGaragePhoto(await removeVehicleBackground(bytes));isCutout=await transparent(bytes);if(!isCutout)warning='Photo saved. Background removal did not return a transparent cutout; you can prepare one in Photo Studio.'}
    catch(e){warning=`Photo saved to the gallery. ${e.message||'Background removal could not finish. Try Photo Studio again.'}`}
  }
  if(isCutout&&!keepFraming)bytes=await sharp(bytes).trim({background:'#00000000',threshold:8}).webp({quality:86}).toBuffer();
  return {bytes,isCutout,warning};
}
module.exports={prepareShowroomPhoto,removeVehicleBackground};
