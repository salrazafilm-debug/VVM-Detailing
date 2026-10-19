import assert from 'node:assert/strict';
import auth from '../server/garage-auth.js';
import {POST} from '../app/api/garage/prepare-photo/route.js';

const original={context:auth.customerContext,admin:auth.requireAdmin,fetch:globalThis.fetch,key:process.env.REMOVE_BG_API_KEY};
const request=(type='image/png')=>{const form=new FormData();form.append('file',new Blob(['photo'],{type}),'car.png');return new Request('http://localhost/api/garage/prepare-photo',{method:'POST',body:form})};
try {
  let calls=0;
  globalThis.fetch=async()=>{calls++;return new Response(new Uint8Array([137,80,78,71]),{headers:{'Content-Type':'image/png'}})};
  auth.customerContext=async()=>{throw Object.assign(new Error('Please sign in.'),{status:401})};
  assert.equal((await POST(request())).status,401);
  auth.customerContext=async()=>({});
  auth.requireAdmin=async()=>{throw Object.assign(new Error('Administrator access required.'),{status:403})};
  assert.equal((await POST(request())).status,403);
  auth.requireAdmin=async ctx=>ctx;
  delete process.env.REMOVE_BG_API_KEY;
  assert.equal((await POST(request())).status,503);
  process.env.REMOVE_BG_API_KEY='test-placeholder';
  assert.equal((await POST(request('text/plain'))).status,400);
  assert.equal(calls,0);
  const result=await POST(request());
  assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');assert.equal((await result.arrayBuffer()).byteLength,4);
  globalThis.fetch=async()=>new Response('{}',{status:402});
  const credits=await POST(request());assert.equal(credits.status,502);assert.match((await credits.json()).error,/credits/);
  console.log('Photo preparation: auth, admin access, missing configuration, input validation, image response and provider errors passed.');
} finally {
  auth.customerContext=original.context;auth.requireAdmin=original.admin;globalThis.fetch=original.fetch;
  if(original.key===undefined)delete process.env.REMOVE_BG_API_KEY;else process.env.REMOVE_BG_API_KEY=original.key;
}
