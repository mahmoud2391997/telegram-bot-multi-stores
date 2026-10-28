// Compact only known structural keys; escape arbitrary keys to preserve round trips.
const keys=['source','message','update','hash','textHash','imageHash','time','status','data','parsed','chat','id','type','message_id','text','caption','photo','video','file_id','file_unique_id','file_size','width','height','body','supplierPrice','candidatePrice','approvalBlocked','info','currency','priceBasis','engine','confidence','reviewReason','expires','step','channel','role','department','title','commission','format','amount','name','requestId','channelId','target'];
function compact(value,decode=false) {
  if(Array.isArray(value)) return value.map(v=>compact(v,decode));
  if(!value || typeof value!=='object') return value;
  return Object.fromEntries(Object.entries(value).map(([key,v])=>{
    const index=keys.indexOf(key);
    const mapped=decode?(key.startsWith('!!')?key.slice(1):/^!\d+$/.test(key)?keys[Number(key.slice(1))]??key:key):(index>=0?`!${index}`:key.startsWith('!')?'!'+key:key);
    return [mapped,compact(v,decode)];
  }));
}
export function packConfig(config) {
  const templates=[...new Set(config.channels.filter(c=>c.format).map(c=>c.format))];
  return {v:2,d:config.departments.map(d=>[d.id,d.name,d.currency]),c:config.channels.map(c=>[c.id,c.title,c.role==='source'?0:1,c.department,c.commission?[c.commission.type==='percent'?1:0,c.commission.amount]:null,c.format?templates.indexOf(c.format):-1]),t:templates,w:compact(config.wizard),r:compact(config.receipts),p:compact(config.posts || []),u:config.updates || [],h:compact(config.held || [])};
}
export function unpackConfig(value) {
  if(value.v!==2) return value;
  return {v:1,departments:value.d.map(([id,name,currency])=>({id,name,currency})),channels:value.c.map(([id,title,role,department,commission,format])=>({id,title,role:role===0?'source':'destination',department,...(commission?{commission:{type:commission[0]?'percent':'fixed',amount:commission[1]}}:{}),...(format>=0?{format:value.t[format]}:{})})),wizard:compact(value.w,true),receipts:compact(value.r,true),posts:compact(value.p,true),updates:value.u,held:compact(value.h,true)};
}
