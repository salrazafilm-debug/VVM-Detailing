const assert=require('node:assert/strict');
const auth=require('../server/garage-auth');
let profiles=[],mode='new',brokenVehicles=false;
const db={auth:{admin:{createUser:async()=>mode==='new'?{data:{user:{id:'client-1'}},error:null}:{data:null,error:{code:'email_exists',message:'Already registered'}},listUsers:async()=>({data:{users:[{id:'client-1',email:'client@example.invalid'}]},error:null})}},from(table){const q={select(){return q},eq(){return q},order(){return q},upsert:async p=>{profiles=[p];return {error:null}},maybeSingle:async()=>({data:profiles[0]||null,error:null}),then(resolve){resolve(table==='garage_profiles'?{data:profiles,error:null}:{data:[],error:brokenVehicles?{message:'relationship missing'}:null})}};return q}};
auth.customerContext=async()=>({admin:db});auth.requireAdmin=async ctx=>ctx;
const garage=require('../server/garage-api');
const req=()=>new Request('https://example.invalid',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'create_customer',email:'Client@example.invalid',display_name:'My Client',password:'test-password-only'})});
(async()=>{
  let response=await garage.adminPost(req());let result=await response.json();assert.equal(response.status,200);assert.equal(result.customer.user_id,'client-1');assert.equal(result.customer.email,'client@example.invalid');assert.equal(profiles.length,1);
  brokenVehicles=true;response=await garage.adminGet(req());result=await response.json();assert.equal(response.status,200);assert.equal(result.customers[0].user_id,'client-1');assert.ok(result.warning);assert.equal(response.headers.get('cache-control'),'no-store');
  mode='duplicate';profiles=[];response=await garage.adminPost(req());result=await response.json();assert.equal(response.status,200);assert.match(result.message,/recovered/);assert.equal(profiles.length,1);
  response=await garage.adminPost(req());result=await response.json();assert.equal(response.status,200);assert.match(result.message,/password has not changed/);
  console.log('Customer registration, independent listing, partial-account recovery and existing selection passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
