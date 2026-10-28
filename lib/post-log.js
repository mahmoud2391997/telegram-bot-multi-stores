import {createHash} from 'node:crypto';

export function fingerprints(message) {
  const text=(message.text || message.caption || '').normalize('NFKC').replace(/\s+/gu,' ').trim();
  const image=message.photo?.at(-1)?.file_unique_id || message.video?.file_unique_id || '';
  const hash=value=>value?createHash('sha256').update(value).digest('base64url'):null;
  return {hash:hash(JSON.stringify([text,image])),textHash:hash(text),imageHash:hash(image)};
}
export function claimPost(config,message,updateId) {
  config.posts ||= [];
  const source=String(message.chat.id);
  if(config.posts.some(p=>(Number.isSafeInteger(updateId)&&p.update===updateId) || (p.source===source&&p.message===message.message_id))) return null;
  const entry={source,message:message.message_id,...(Number.isSafeInteger(updateId)?{update:updateId}:{}),...fingerprints(message),time:Date.now(),status:'processing'};
  config.posts.push(entry);
  config.posts=config.posts.slice(-24);
  return entry;
}
