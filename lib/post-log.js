import {createHash} from 'node:crypto';
import {postLogLimit} from './limits.js';

export function fingerprints(message) {
  const text=(message.text || message.caption || '').normalize('NFKC').replace(/\s+/gu,' ').trim();
  const image=message.photo?.at(-1)?.file_unique_id || message.video?.file_unique_id || '';
  const hash=value=>value?createHash('sha256').update(value).digest().subarray(0,16).toString('base64url'):null;
  return {hash:hash(JSON.stringify([text,image])),imageHash:hash(image)};
}
export function claimPost(config,message,updateId) {
  config.posts ||= [];
  const source=String(message.chat.id);
  if(config.posts.some(p=>(Number.isSafeInteger(updateId)&&p.update===updateId) || (p.source===source&&p.message===message.message_id))) return null;
  const entry={source,message:message.message_id,...(Number.isSafeInteger(updateId)?{update:updateId}:{}),...fingerprints(message),time:Date.now(),status:'processing'};
  config.posts.push(entry);
  config.posts=config.posts.slice(-postLogLimit());
  return entry;
}
export function compactMessage(message) {
  return {chat:{id:message.chat.id,type:message.chat.type},message_id:message.message_id,...(message.text?{text:message.text}:{}),...(message.caption?{caption:message.caption}:{}),...(message.photo?{photo:[message.photo.at(-1)]}:{}),...(message.video?{video:{file_id:message.video.file_id,file_unique_id:message.video.file_unique_id}}:{})};
}
export function duplicateWindowHours() {
  const hours=Number(process.env.DUPLICATE_WINDOW_HOURS ?? 24);
  return Number.isFinite(hours)&&hours>=0?Math.min(hours,720):24;
}
export function findDuplicate(config,current,now=Date.now()) {
  const window=duplicateWindowHours()*3600000;
  if(!window) return null;
  return (config.posts || []).find(p=>p!==current && p.source===current.source && (['sent','uncertain','processing'].includes(p.status) || config.receipts?.some(r=>r.source===p.source&&r.message===p.message&&['sent','uncertain'].includes(r.status))) && p.time<=now && now-p.time<=window && (p.hash===current.hash || (current.imageHash&&p.imageHash===current.imageHash))) || null;
}
