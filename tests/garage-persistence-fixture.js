const CLIENT='22222222-2222-4222-8222-222222222222';
function persistenceFixture() {
  const state={garage_profiles:[{user_id:CLIENT,display_name:'Trent',email:'trent@example.invalid',created_at:new Date().toISOString()}],garage_vehicles:[],garage_photos:[],garage_services:[],garage_appointments:[],garage_maintenance_cycles:[],garage_offers:[]};
  const files=new Map(),fail={};
  let serial=0;
  const db={from(table){
    let operation='select',payload,columns='*',filters=[];
    const q={select(value='*'){columns=value;return q},order(){return q},eq(key,value){filters.push(row=>row[key]===value);return q},in(key,values){filters.push(row=>values.includes(row[key]));return q},gte(){return q},lte(){return q},insert(value){operation='insert';payload=value;return q},update(value){operation='update';payload=value;return q},single(){return execute(true)},maybeSingle(){return execute(true)},then(resolve,reject){return execute(false).then(resolve,reject)}};
    async function execute(single){
      // Reproduce the actual dual-FK schema, rather than accepting ambiguous joins.
      if(table==='garage_vehicles'&&columns.includes('garage_photos('))return {data:null,error:{code:'PGRST201',message:'More than one relationship was found'}};
      if(fail[`${table}:${operation}`])return {data:null,error:{code:'TEST_OUTAGE',message:'Simulated unavailable database'}};
      let rows=state[table].filter(row=>filters.every(fn=>fn(row)));
      if(operation==='insert'){
        const row={id:`33333333-3333-4333-8333-${String(++serial).padStart(12,'0')}`,created_at:new Date().toISOString(),...payload};
        state[table].push(row);rows=[row];
      }
      if(operation==='update')rows.forEach(row=>Object.assign(row,payload));
      return {data:structuredClone(single?rows[0]||null:rows),error:null};
    }
    return q;
  },storage:{from(){return {
    upload:async(path,bytes,options)=>{if(fail.storage)return {error:{message:'Simulated storage outage'}};files.set(path,{bytes:Buffer.from(bytes),options});return {error:null}},
    remove:async paths=>{paths.forEach(p=>files.delete(p));return {error:null}},
    createSignedUrl:async path=>({data:fail.signing?null:{signedUrl:`/__private/${path}`},error:fail.signing?{message:'Unavailable'}:null}),
    createSignedUrls:async paths=>({data:fail.signing?null:paths.map(path=>({path,signedUrl:`/__private/${path}`})),error:fail.signing?{message:'Unavailable'}:null}),
  }}}};
  return {db,state,files,fail,clientId:CLIENT};
}
module.exports={persistenceFixture};
