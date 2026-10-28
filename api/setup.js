import {timingSafeEqual} from 'node:crypto';
import {registerWebhook} from '../lib/setup.js';
import {telegram} from '../lib/telegram.js';
export default async function handler(req,res) {
  if(req.method!=='POST') {res.setHeader('Allow','POST');return res.status(405).end();}
  const body=typeof req.body==='string' ? Object.fromEntries(new URLSearchParams(req.body)) : req.body || {};
  const token=process.env.BOT_TOKEN;
  const expected=token?`Bearer ${token}`:null;
  const actual=req.headers.authorization || (typeof body.token==='string'?`Bearer ${body.token}`:null);
  if(!expected || typeof actual!=='string' || Buffer.byteLength(actual)!==Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(actual),Buffer.from(expected))) return res.status(401).end();
  try {
    if(body.action==='owner') {
      if(process.env.OWNER_ID) return res.status(409).json({ok:false,message:'تم تعيين المالك بالفعل. لا يمكن تغييره من صفحة التفعيل.'});
      const webhook=await telegram('getWebhookInfo',{});
      if(webhook.url) return res.status(409).json({ok:false,message:'البوت مرتبط بالفعل. اضبط معرّف المالك في Vercel مباشرة.'});
      const updates=await telegram('getUpdates',{timeout:0,limit:100,allowed_updates:['message']});
      const owners=[...new Set(updates.filter(u=>u.message?.chat.type==='private' && u.message.text==='/start' && !u.message.from?.is_bot).map(u=>String(u.message.from.id)))];
      if(owners.length!==1) return res.status(409).json({ok:false,message:'افتح البوت الجديد وأرسل /start من حساب المالك فقط، ثم حاول مجددًا. يجب أن يكون هناك حساب واحد لبدء الإعداد.'});
      return res.status(200).json({ok:true,owner_id:owners[0],message:'احفظ هذا المعرّف في OWNER_ID داخل Vercel ثم أعد النشر واربط البوت.'});
    }
    if(!process.env.OWNER_ID || !process.env.WEBHOOK_SECRET || !process.env.APP_URL) return res.status(503).json({ok:false,message:'أكمل إعدادات السيرفر في Vercel أولًا.'});
    const bot=await registerWebhook();return res.status(200).json({ok:true,username:bot.username});
  } catch {console.error('تعذر إعداد ربط تيليجرام');return res.status(503).json({ok:false,message:'تعذر ربط البوت. تحقق من إعدادات Vercel وصحة الرمز.'});}
}
