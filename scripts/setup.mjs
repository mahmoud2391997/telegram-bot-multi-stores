import {registerWebhook} from '../lib/setup.js';
if(!process.env.BOT_TOKEN || !process.env.APP_URL) throw new Error('أضف BOT_TOKEN وAPP_URL إلى ملف الإعدادات المحلي أولًا.');
if(process.env.WEBHOOK_SECRET) {
  const bot=await registerWebhook();
  console.log(`تم ربط البوت @${bot.username}. افتح المحادثة وأرسل /start.`);
} else {
  // The production webhook secret remains in Vercel; do not retrieve or copy it locally.
  const url=new URL('/api/setup',process.env.APP_URL);
  if(url.protocol!=='https:') throw new Error('عنوان السيرفر يجب أن يستخدم HTTPS');
  const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${process.env.BOT_TOKEN}`},redirect:'error',signal:AbortSignal.timeout(45000)});
  if(!response.ok) throw new Error(`تعذر الربط (${response.status}). أضف بيانات البوت والمالك إلى Vercel وأعد النشر أولًا.`);
  const result=await response.json();
  console.log(`تم ربط البوت @${result.username}. افتح المحادثة وأرسل /start.`);
}
