import {createHash} from 'node:crypto';
import {settingsText,emptyConfig} from '../lib/settings.js';
import {clothingFormat} from '../lib/parser.js';
import {postLogLimit,attemptLogLimit,updateLogLimit} from '../lib/limits.js';
// Deterministic representative data, not production data or credentials.
process.env.WEBHOOK_SECRET ||= 'storage-measurement-placeholder';
const tag=i=>createHash('sha256').update(String(i)).digest('base64url');
export function fixture(channels,sections,{reserve=false,uniqueTemplates=false}={}) {
  const config=emptyConfig();
  config.departments=Array.from({length:sections},(_,i)=>({id:tag(i).slice(0,6),name:`قسم الملابس ${tag(i).slice(5,17)}`,currency:'جنيه'}));
  config.channels=Array.from({length:channels},(_,i)=>({id:`-100${1000000000+i}`,title:`متجر ملابس ${tag(i+500).slice(0,20)}`,role:i%2?'destination':'source',department:config.departments[i%sections].id,...(i%2?{commission:{type:'percent',amount:10+i%7},format:clothingFormat+(uniqueTemplates?`\n${tag(i).slice(0,30)}`:'')}:{})}));
  if(reserve) {
    config.posts=Array.from({length:postLogLimit()},(_,i)=>({source:'-1001000000000',message:i,update:i+1000,hash:tag(i+1).slice(0,22),imageHash:tag(i+200).slice(0,22),time:1793228000000+i,status:'sent'}));
    config.receipts=Array.from({length:attemptLogLimit()},(_,i)=>({source:'-1001000000000',message:i,target:'-1001000000001',status:'sent'}));
    config.updates=Array.from({length:updateLogLimit()},(_,i)=>10000+i);
    config.held=Array.from({length:2},(_,i)=>({id:tag(i).slice(0,8),source:'-1001000000000',message:i+500,data:{chat:{id:-1001000000000,type:'channel'},message_id:i+500,caption:`منتج ملابس ${tag(i).repeat(4)}`,photo:[{file_id:tag(i+9),file_unique_id:tag(i+10)}]},parsed:{body:'منتج ملابس',supplierPrice:null,candidatePrice:'75',confidence:0.9,info:{'اسم_المنتج':'منتج ملابس','الكود':tag(i).slice(0,6)},reviewReason:'أسعار متعارضة'}}));
  }
  return config;
}
export function measure(channels,sections,options) {
  try {return settingsText(fixture(channels,sections,options)).length;}catch{return Infinity;}
}
if(import.meta.url===`file://${process.argv[1]}`) {
  const results=[];
  for(const reserve of [false,true]) for(const uniqueTemplates of [false,true]) for(const axis of ['channels','sections']) {
    let n=1;while(n<1000 && measure(axis==='channels'?n:20,axis==='sections'?n:10,{reserve,uniqueTemplates})<=4000) n++;
    const max=n-1;results.push({axis,reserve,uniqueTemplates,max,fitsChars:max?measure(axis==='channels'?max:20,axis==='sections'?max:10,{reserve,uniqueTemplates}):null,nextChars:measure(axis==='channels'?n:20,axis==='sections'?n:10,{reserve,uniqueTemplates})});
  }
  console.table(results);
}
