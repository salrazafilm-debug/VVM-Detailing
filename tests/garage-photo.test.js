const assert = require('node:assert/strict');
const sharp = require('sharp');
const { normalizeGaragePhoto } = require('../server/garage-photo');
const { vehicleLabel } = require('../server/garage-vehicle');
(async () => {
  assert.equal(vehicleLabel({year:null,make:null,model:'M3'}),'M3');
  assert.equal(vehicleLabel({make:'BMW',model:'M3'}),'BMW M3');
  assert.equal(vehicleLabel({year:2024,model:'M3'}),'2024 M3');
  for (const format of ['jpeg','png','webp']) {
    const input = await sharp({create:{width:3600,height:2400,channels:3,background:'#e9b3b3'}})[format]().toBuffer();
    const photo = await normalizeGaragePhoto(input);
    const meta = await sharp(photo).metadata();
    assert.equal(meta.format,'webp');assert.equal(meta.width,2400);assert.equal(meta.height,1600);
    assert.ok(photo.length < 4*1024*1024);assert.equal(meta.exif,undefined);
  }
  const oriented = await sharp({create:{width:400,height:200,channels:3,background:'#4f8ff0'}}).jpeg().withMetadata({orientation:6}).toBuffer();
  const orientedMeta = await sharp(await normalizeGaragePhoto(oriented)).metadata();
  assert.equal(orientedMeta.width,200);assert.equal(orientedMeta.height,400);assert.equal(orientedMeta.exif,undefined);
  const transparent = await sharp({create:{width:80,height:40,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer();
  assert.equal((await sharp(await normalizeGaragePhoto(transparent)).metadata()).hasAlpha,true);
  await assert.rejects(normalizeGaragePhoto(Buffer.from('not a photo')), e=>e.status===400);
  // Exercise the upload endpoint as well: it accepts JPEG and stores only WebP.
  let stored=null,uploads=0;const sent=[];
  const db={from(table){const q={select(){return q},eq(){return q},insert(){return q},single:async()=>({data:table==='garage_vehicles'?{id:'vehicle-1'}:{id:'photo-1'},error:null})};return q},storage:{from(){return {upload:async(path,bytes,options)=>{uploads++;sent.push({path,bytes,options});if(!stored)stored={path,bytes,options};return {error:null}}}}}};
  const auth=require('../server/garage-auth');auth.customerContext=async()=>({admin:db});auth.requireAdmin=async ctx=>ctx;
  const garage=require('../server/garage-api');
  const request=(bytes,type)=>{const form=new FormData();form.append('vehicle_id','vehicle-1');form.append('file',new Blob([bytes],{type}),'photo');return new Request('https://example.invalid',{method:'POST',body:form})};
  let response=await garage.photoPost(request(oriented,'image/jpeg'));
  assert.equal(response.status,200);assert.equal(uploads,2,'Original and smaller display copy');assert.match(sent[1].path,/display-.*\.webp$/);assert.equal(sent[1].options.contentType,'image/webp');assert.equal(stored.options.contentType,'image/webp');assert.match(stored.path,/\.webp$/);
  assert.equal((await sharp(stored.bytes).metadata()).format,'webp');
  response=await garage.photoPost(request('invalid bytes','image/webp'));
  assert.equal(response.status,400);assert.equal(uploads,2,'Invalid photos must not reach storage');
  console.log('Optional vehicle labels and automatic photo format, resize, orientation, metadata removal and validation passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
