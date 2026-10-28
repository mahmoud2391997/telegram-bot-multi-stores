import {timingSafeEqual} from 'node:crypto';
import {registerWebhook} from '../lib/setup.js';
export default async function handler(req,res) {
  if(req.method!=='POST') {res.setHeader('Allow','POST');return res.status(405).end();}
  const token=process.env.BOT_TOKEN;
  const expected=token?`Bearer ${token}`:null;
  const actual=req.headers.authorization;
  if(!expected || typeof actual!=='string' || Buffer.byteLength(actual)!==Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(actual),Buffer.from(expected))) return res.status(401).end();
  if(!process.env.OWNER_ID || !process.env.WEBHOOK_SECRET || !process.env.APP_URL) return res.status(503).json({ok:false,message:'أكمل إعدادات السيرفر في Vercel أولًا.'});
  try { const bot=await registerWebhook();return res.status(200).json({ok:true,username:bot.username}); }
  catch {console.error('تعذر تسجيل عنوان استقبال تيليجرام');return res.status(503).json({ok:false,message:'تعذر ربط البوت. تحقق من إعدادات Vercel وصحة الرمز.'});}
}
