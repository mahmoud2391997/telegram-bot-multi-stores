import {telegram} from './telegram.js';
import {AnalysisError} from './ai-parser.js';
import {remaining} from './request-budget.js';
const maxImageBytes=8*1024*1024;
export async function downloadTelegramPhoto(message,{callTelegram=telegram,fetchFile=fetch}={}) {
  const photo=message.photo?.at(-1);
  if(!photo) return null;
  if(photo.file_size>maxImageBytes) throw new AnalysisError('image_size','الصورة أكبر من 8 ميجابايت. أرسل نسخة أصغر للتحليل.');
  const file=await callTelegram('getFile',{file_id:photo.file_id});
  const path=file.file_path;
  if(!path || path.includes('..') || !/^[A-Za-z0-9_/-]+\.(?:jpe?g|png|webp)$/i.test(path)) throw new AnalysisError('image_type','تعذر تحميل صورة مدعومة من تيليجرام.');
  if(file.file_size>maxImageBytes) throw new AnalysisError('image_size','الصورة أكبر من الحد المسموح.');
  const response=await fetchFile(`https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${path}`,{signal:AbortSignal.timeout(Math.max(1,Math.min(15000,remaining()-15000))),redirect:'error'});
  if(!response.ok || Number(response.headers.get('content-length'))>maxImageBytes) throw new AnalysisError('image_download','تعذر تحميل الصورة للتحليل.');
  const chunks=[];let length=0;
  for await(const chunk of response.body) {
    length+=chunk.length;
    if(length>maxImageBytes) {await response.body.cancel?.().catch(()=>{});throw new AnalysisError('image_size','الصورة أكبر من الحد المسموح.');}
    chunks.push(chunk);
  }
  const data=Buffer.concat(chunks);
  const mediaType=data[0]===0xff && data[1]===0xd8 && data[2]===0xff?'image/jpeg':data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':data.toString('ascii',0,4)==='RIFF' && data.toString('ascii',8,12)==='WEBP'?'image/webp':null;
  if(!mediaType) throw new AnalysisError('image_type','ملف الصورة غير صالح أو نوعه غير مدعوم.');
  // Only bytes are passed to Groq. Never pass the Telegram URL containing BOT_TOKEN.
  return {data,mediaType};
}
