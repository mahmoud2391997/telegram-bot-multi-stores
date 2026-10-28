import {telegram} from '../lib/telegram.js';
for(const key of ['BOT_TOKEN','OWNER_ID','WEBHOOK_SECRET','APP_URL']) if(!process.env[key]) throw new Error(`متغير الإعدادات مفقود: ${key}`);
if(!/^\d+$/.test(process.env.OWNER_ID)) throw new Error('OWNER_ID يجب أن يكون معرّف المالك الرقمي في تيليجرام');
if(!/^[A-Za-z0-9_-]{16,256}$/.test(process.env.WEBHOOK_SECRET)) throw new Error('استخدم WEBHOOK_SECRET عشوائيًا بطول 16 إلى 256 حرفًا من الحروف الإنجليزية والأرقام والشرطة والشرطة السفلية');
const url=new URL('/api/webhook',process.env.APP_URL);
if(url.protocol!=='https:') throw new Error('APP_URL يجب أن يستخدم HTTPS');
await telegram('setWebhook',{url:url.href,secret_token:process.env.WEBHOOK_SECRET,allowed_updates:['message','channel_post'],max_connections:1});
await telegram('setMyCommands',{commands:[{command:'start',description:'فتح قائمة إدارة القنوات'},{command:'help',description:'شرح استخدام البوت'},{command:'cancel',description:'إلغاء الخطوة الحالية'}]});
console.log('تم تسجيل عنوان استقبال التحديثات. افتح البوت وأرسل /start. لا تحتاج إلى قاعدة بيانات.');
