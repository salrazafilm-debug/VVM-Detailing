// Book My Day only emails the request: one email, no Square, no holds, no prices.
const assert=require('assert'); const Module=require('module');
process.env.RESEND_API_KEY='re_test';
const calls={mail:0,holds:0,square:0}; let mailThrows=false, sent=null;
const realLoad=Module._load;
Module._load=function(req,...a){
  if(req==='../mail'||req.endsWith('/mail')) return {sendBookingEmail:async opts=>{calls.mail++; if(mailThrows) throw Object.assign(new Error('down'),{status:502}); sent=opts; return {}}};
  if(req==='../square'||req.endsWith('/square')){const real=realLoad.call(this,req,...a);return {...real,loadCatalog:async()=>{calls.square++;throw new Error('Square should not be read by Book My Day')}}}
  if(req.endsWith('/holds')) return {addHold:async()=>{calls.holds++}};
  return realLoad.call(this,req,...a)};
const {handler}=require('../server/handlers/book.js');
const body={name:'Test Person',phone:'2405550100',email:'t@e.com',date:'2026-11-05',time:'09:00',vehicles:['2022 Lexus IS 350'],summary:'2022 Lexus IS 350: Full Factory Reset (SUV) + Pet hair removal',notes:'gate code 12',zip:'20732',location:'123 Main St, Chesapeake Beach, MD 20732',servicesCents:32000};
const post=(b)=>handler({httpMethod:'POST',body:JSON.stringify(b)});
(async()=>{
  let r=await post(body); assert.equal(r.statusCode,200,r.body);
  assert.equal(calls.mail,1); assert.equal(calls.holds,0); assert.equal(calls.square,0);
  const text=sent.lines.join('\n');
  assert.match(text,/Name: Test Person/); assert.match(text,/Day: 2026-11-05/); assert.match(text,/Time: 09:00/);
  assert.match(text,/Vehicle: 2022 Lexus IS 350/); assert.match(text,/Full Factory Reset \(SUV\)/); assert.match(text,/gate code 12/);
  assert.equal(sent.replyTo,'t@e.com');
  // membership or code is included when given
  r=await post({...body,coupon:'VVM123'}); assert.equal(r.statusCode,200); assert.match(sent.lines.join('\n'),/Code \/ membership: VVM123/);
  // family area ZIP: no travel fee, and the $25 family discount is applied (one discount per booking)
  r=await post(body); assert.equal(r.statusCode,200); let t=sent.lines.join('\n');
  assert.match(t,/Travel fee: \$0/); assert.match(t,/Family area: yes/); assert.match(t,/Discount applied: Family area \(-\$25\)/); assert.match(t,/TOTAL \$295/);
  // a ZIP that is a paid trip: the fee is in the email, no family discount
  r=await post({...body,zip:'20001',location:'1 K St NW, Washington, DC 20001'}); assert.equal(r.statusCode,200); t=sent.lines.join('\n');
  assert.match(t,/Travel: ZIP 20001/); assert.doesNotMatch(t,/Family area/); assert.match(t,/Travel fee: \$(25|30)/);
  // too far, unknown ZIP or no ZIP: not booked online, nothing emailed
  let mailBefore=calls.mail;
  for(const z of ['22101','99999','','12']){ r=await post({...body,zip:z}); assert.equal(r.statusCode,400,'zip '+z); }
  assert.equal(calls.mail,mailBefore);
  // the address is required for mobile service, and its ZIP must be the checked ZIP
  mailBefore=calls.mail;
  r=await post({...body,location:''}); assert.equal(r.statusCode,400); assert.match(JSON.parse(r.body).error,/address/);
  r=await post({...body,location:'1 K St NW, Washington, DC 20001'}); assert.equal(r.statusCode,400); assert.match(JSON.parse(r.body).error,/ZIP/);
  r=await post({...body,location:'20732 Bay Ave, Chesapeake Beach, MD'}); assert.equal(r.statusCode,200,'a 5-digit house number is not mistaken for a ZIP');
  assert.equal(calls.mail,mailBefore+1);
  // drop-off needs no ZIP and has no travel fee
  r=await post({...body,zip:'',location:'',dropOff:true}); assert.equal(r.statusCode,200); t=sent.lines.join('\n');
  assert.match(t,/DROP-OFF/); assert.doesNotMatch(t,/Travel: ZIP/);
  // a membership or gift price takes no family discount
  r=await post({...body,coupon:'VVM123'}); assert.equal(r.statusCode,200); assert.doesNotMatch(sent.lines.join('\n'),/Discount applied/);
  // gifted detail is labelled
  r=await post({...body,coupon:'VVMGIFT',gift:true,gift_from:'VVM Details'}); assert.equal(r.statusCode,200); assert.match(sent.subject,/GIFTED DETAIL/);
  // bad input is refused, nothing is emailed
  const before=calls.mail;
  for(const bad of [{...body,name:'A'},{...body,phone:'123'},{...body,email:'nope'},{...body,date:'tomorrow'}]){ r=await post(bad); assert.equal(r.statusCode,400,JSON.stringify(bad)); }
  assert.equal(calls.mail,before);
  // email down: the client is told to call or text, nothing else happens
  mailThrows=true; r=await post(body); assert.equal(r.statusCode,502); assert.match(JSON.parse(r.body).error,/call or text/);
  // honeypot: bots get a fake success and nothing is sent
  mailThrows=false; const n=calls.mail; r=await post({...body,website:'spam'}); assert.equal(r.statusCode,200); assert.equal(calls.mail,n);
  console.log('book.js tests passed:',JSON.stringify(calls));
})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
