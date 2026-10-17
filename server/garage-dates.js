// Calendar dates follow the detailing business's Eastern time zone.
function addMonths(value, months) {
  const [year,month,day]=value.split('-').map(Number);
  const last=new Date(Date.UTC(year,month-1+months+1,0)).getUTCDate();
  return new Date(Date.UTC(year,month-1+months,Math.min(day,last))).toISOString().slice(0,10);
}
function sealantProgress(cycle, now=new Date()) {
  if(!cycle) return {value:0,label:'No active sealant cycle'};
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
  const today=`${parts.year}-${parts.month}-${parts.day}`;
  const clock=Date.parse(`${today}T${parts.hour}:${parts.minute}:${parts.second}Z`);
  const start=Date.parse(`${cycle.applied_on}T00:00:00Z`),end=Date.parse(`${cycle.sealant_expires_at}T00:00:00Z`);
  const value=Math.max(0,Math.min(100,(clock-start)/Math.max(1,end-start)*100));
  const days=Math.max(0,Math.ceil((end-clock)/86400000));
  const completed=[1,2,3].filter(m=>today>=addMonths(cycle.applied_on,m)).length;
  return {value,label:days?`${completed}/3 months used · ${3-completed} months protection remaining (${days} days)`:'Estimated protection period complete'};
}
module.exports={addMonths,sealantProgress};
