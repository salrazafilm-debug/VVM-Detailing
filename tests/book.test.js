const assert=require('assert'); const Module=require('module');
process.env.SQUARE_ACCESS_TOKEN='x'; process.env.RESEND_API_KEY='re_test'; process.env.MIN_NOTICE_HOURS='0';
const calls={forms:0,holds:0}; let formStatus=200, formThrows=false;
const dayStr=(()=>{const d=new Date(Date.now()+5*864e5);return d.toISOString().slice(0,10)})();
const cat={V1:{id:'V1',item:'Exterior Reset',label:'Sedan',kind:'exterior',priceCents:12000,durationMin:90,transitionMin:0,version:1,bookable:true,teamMemberId:'T'},
  V2:{id:'V2',item:'Maintenance Plan',label:'Sedan',kind:'full',priceCents:15000,durationMin:255,transitionMin:0,version:1,bookable:true,teamMemberId:'T'},
  V3:{id:'V3',item:'Full Factory Reset',label:'SUV',kind:'full',priceCents:32000,durationMin:330,transitionMin:0,version:1,bookable:true,teamMemberId:'T'},
  V4:{id:'V4',item:'Headlight Restoration',label:'Regular',kind:'headlight',priceCents:13500,durationMin:60,transitionMin:0,version:1,bookable:true,teamMemberId:'T'},
  V5:{id:'V5',item:'Paint Enhancement + 5 yr Ceramic coating',label:'SUV',kind:'ceramic',priceCents:95000,durationMin:390,transitionMin:0,version:1,bookable:true,teamMemberId:'T'}};
const realLoad=Module._load;
Module._load=function(req,...a){
  if(req==='../square'||req.endsWith('/square')){const real=realLoad.call(this,req,...a);return {...real,loadCatalog:async()=>cat,blocksByDay:async()=>({}),getLocationId:async()=>'L'}}
  if(req==='../holds'||req.endsWith('/holds')){const real=realLoad.call(this,req,...a);return {...real,blocksWithHolds:async(d)=>d,addHold:async()=>{calls.holds++}}}
  return realLoad.call(this,req,...a)};
let lastForm=null; const pick=(t,re)=>{const m=t.match(re); return m?m[1]:''}; global.fetch=async(u,o)=>{calls.forms++; if(formThrows) throw new Error('net'); const t=JSON.parse(o.body).text; lastForm={addons:pick(t,/Add-ons: (.*)/),service:pick(t,/Services: (.*)/),vehicle:pick(t,/Vehicle: (.*)/),total:pick(t,/Total: (.*)/),party:pick(t,/Party: (.*)/)}; return {ok:formStatus<400,status:formStatus}};
const {handler}=require('../server/handlers/book.js');
const body={name:'Test Person',phone:'2405550100',email:'t@e.com',vehicle:'2022 Lexus',date:dayStr,time:'09:00',variationId:'V1',notes:'x'};
const ev=(h)=>({httpMethod:'POST',headers:h,body:JSON.stringify(body)});
(async()=>{
  let r=await handler(ev({host:'vvmdetails.com'})); assert.equal(r.statusCode,200,r.body); assert.equal(calls.forms,1); assert.equal(calls.holds,1);           // success: email sent THEN hold saved
  formStatus=500; r=await handler(ev({host:'vvmdetails.com'})); assert.equal(r.statusCode,502); assert.equal(calls.holds,1);                                      // email failed: customer told, NO hold added
  formStatus=200; formThrows=true; r=await handler(ev({host:'vvmdetails.com'})); assert.equal(r.statusCode,502); assert.equal(calls.holds,1);                    // network error: same
  formThrows=false; delete process.env.RESEND_API_KEY; r=await handler(ev({})); assert.equal(r.statusCode,503); assert.equal(calls.holds,1); process.env.RESEND_API_KEY='re_test';                                                          // no origin: loud failure, not silent
  r=await handler({httpMethod:'POST',headers:{host:'vvmdetails.com'},body:JSON.stringify({...body,variationId:'V2'})}); assert.equal(r.statusCode,400); assert.equal(calls.holds,1);   // Maintenance Plan is clients-only: never bookable on the site
  const {isPublic}=require('../server/square'); assert.equal(isPublic(cat.V1),true); assert.equal(isPublic(cat.V2),false);
  const post=(extra)=>handler({httpMethod:'POST',headers:{host:'vvmdetails.com'},body:JSON.stringify({...body,variationId:undefined,...extra})});
  const snap=()=>({f:calls.forms,h:calls.holds}); let a=snap();
  // two services on ONE vehicle (full detail + headlight): one email, one hold, both named in the email
  r=await post({plan:[['V3','V4']],vehicles:['2022 Lexus IS 350']}); assert.equal(r.statusCode,200,r.body);
  assert.deepEqual([calls.forms-a.f,calls.holds-a.h],[1,1]);
  assert.match(lastForm.service,/Full Factory Reset - SUV \+ Headlight Restoration - Regular/); assert.equal(lastForm.total,'$455'); assert.equal(lastForm.party,'1 vehicle');
  // TWO vehicles: one email, two holds back to back
  a=snap(); r=await post({plan:[['V1'],['V4']],vehicles:['2021 Honda Civic','2019 Ford F-150']}); assert.equal(r.statusCode,200,r.body);
  assert.deepEqual([calls.forms-a.f,calls.holds-a.h],[1,2]);
  assert.match(lastForm.vehicle,/Vehicle 1: 2021 Honda Civic \| Vehicle 2: 2019 Ford F-150/); assert.match(lastForm.service,/Vehicle 1: Exterior Reset - Sedan \| Vehicle 2: Headlight Restoration - Regular/); assert.match(lastForm.party,/2 vehicles/);
  // refused: nothing sent, nothing held
  a=snap();
  for(const [bad,re] of [
    [{plan:[['V1'],['V1'],['V1']],vehicles:['a car','b car','c car']},/3 or more vehicles/],   // 3+ vehicles go to text/email
    [{plan:[['V1'],['V4']],vehicles:['only one car']},/both vehicles/],                          // second vehicle missing
    [{plan:[['V5','V4']],vehicles:['x car']},/whole day/],                                       // ceramic stands alone
    [{plan:[['V5'],['V1']],vehicles:['x car','y car']},/whole day/],
    [{plan:[['V3','V1']],vehicles:['x car']},/already includes/],                                // full + exterior is redundant
    [{plan:[['V4','V4']],vehicles:['x car']},/once per vehicle/],
    [{plan:[['V2','V4']],vehicles:['x car']},/unknown service/i],                                 // maintenance never public
    [{plan:[],vehicles:[]},/vehicle/i],
  ]){ r=await post(bad); assert.equal(r.statusCode,400,JSON.stringify(bad)); assert.match(JSON.parse(r.body).error,re,JSON.stringify(bad)); }
  assert.deepEqual([calls.forms-a.f,calls.holds-a.h],[0,0]);
  // legacy single-service request still works (older pages open during a deploy)
  a=snap(); r=await handler(ev({host:'vvmdetails.com'})); assert.equal(r.statusCode,200,r.body); assert.deepEqual([calls.forms-a.f,calls.holds-a.h],[1,1]);
  // add-ons: priced by the server, only for Full Factory Reset / Interior Reset
  a=snap(); r=await post({plan:[['V3']],vehicles:['2022 Lexus IS 350'],addons:[['pet-hair','odor']]}); assert.equal(r.statusCode,200,r.body);
  assert.equal(lastForm.total,'$430'); assert.match(lastForm.addons,/Pet hair removal \(\$50\), Odor removal \(\$60\)/); assert.deepEqual([calls.forms-a.f,calls.holds-a.h],[1,1]);
  a=snap(); r=await post({plan:[['V1']],vehicles:['x car'],addons:[['stain']]}); assert.equal(r.statusCode,400); assert.match(JSON.parse(r.body).error,/Add-ons are for/);   // exterior only: no add-ons
  r=await post({plan:[['V3']],vehicles:['x car'],addons:[['bogus']]}); assert.equal(r.statusCode,400);                                                                            // unknown add-on
  assert.deepEqual([calls.forms-a.f,calls.holds-a.h],[0,0]);
  console.log('book.js tests passed:',JSON.stringify(calls));
})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
