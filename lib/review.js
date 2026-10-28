import {randomBytes} from 'node:crypto';
import {compactMessage} from './post-log.js';
import {validPrice} from './parser.js';
export const heldLimit=()=>Math.max(1,Math.min(5,Number.parseInt(process.env.MAX_HELD_POSTS,10)||2));
export function holdPost(config,message,parsed) {
  config.held ||= [];
  if(config.held.length>=heldLimit()) return null;
  const entry={id:randomBytes(4).toString('hex'),source:String(message.chat.id),message:message.message_id,data:compactMessage(message),parsed};
  config.held.push(entry);return entry;
}
export const reviewButtons=entry=>({inline_keyboard:[[{text:'موافقة',callback_data:`approve:${entry.id}`},{text:'تعديل السعر',callback_data:`price:${entry.id}`},{text:'رفض',callback_data:`reject:${entry.id}`}]]});
export const reviewSummary=entry=>`المنشور ${entry.message} يحتاج مراجعة\n${Object.entries(entry.parsed.info || {}).filter(([,v])=>v).map(([k,v])=>`${k.replaceAll('_',' ')}: ${v}`).join('\n')}\nالسعر المقترح: ${entry.parsed.candidatePrice || 'غير واضح'}\nالثقة: ${entry.parsed.confidence===undefined?'غير متاحة':Math.round(entry.parsed.confidence*100)+'٪'}\nالسبب: ${entry.parsed.reviewReason || 'لم يُعثر على سعر واحد واضح.'}`;
export const canApprove=entry=>!entry.parsed.approvalBlocked && (entry.parsed.confidence===undefined || entry.parsed.confidence>=0.85) && validPrice(entry.parsed.supplierPrice || '');
