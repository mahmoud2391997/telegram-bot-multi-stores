import {telegram} from './telegram.js';
export async function registerWebhook() {
  for(const key of ['BOT_TOKEN','OWNER_ID','WEBHOOK_SECRET','APP_URL']) if(!process.env[key]) throw new Error(`متغير الإعدادات مفقود: ${key}`);
  if(!/^\d+$/.test(process.env.OWNER_ID)) throw new Error('معرّف المالك غير صالح');
  if(!/^[A-Za-z0-9_-]{16,256}$/.test(process.env.WEBHOOK_SECRET)) throw new Error('رمز استقبال التحديثات غير صالح');
  const url=new URL('/api/webhook',process.env.APP_URL);
  if(url.protocol!=='https:') throw new Error('عنوان السيرفر يجب أن يستخدم HTTPS');
  const me=await telegram('getMe',{});
  await telegram('setWebhook',{url:url.href,secret_token:process.env.WEBHOOK_SECRET,allowed_updates:['message','channel_post','callback_query'],max_connections:1});
  await telegram('setMyCommands',{commands:[{command:'start',description:'فتح قائمة إدارة القنوات'},{command:'help',description:'شرح استخدام البوت'},{command:'cancel',description:'إلغاء الخطوة الحالية'}]});
  return {username:me.username};
}
