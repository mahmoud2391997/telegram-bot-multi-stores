import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/setup.js';
const response=()=>({code:null,body:null,setHeader(){},status(code){this.code=code;return this;},end(){return this;},json(body){this.body=body;return this;}});
process.env.BOT_TOKEN='test-token-not-real';
process.env.OWNER_ID='42';
process.env.WEBHOOK_SECRET='local-test-secret-not-real';
process.env.APP_URL='https://example.vercel.app';
test('يرفض إعداد البوت دون مصادقة المالك',async()=>{const r=response();await handler({method:'POST',headers:{authorization:'Bearer wrong'}},r);assert.equal(r.code,401);});
test('يسجل العنوان الإنتاجي بالرمز المخزن دون كشفه',async()=>{
  const original=global.fetch;const calls=[];
  global.fetch=async(url,request)=>{const method=url.split('/').at(-1);calls.push({method,data:JSON.parse(request.body)});return {json:async()=>({ok:true,result:method==='getMe'?{username:'example_bot'}:true})};};
  try{const r=response();await handler({method:'POST',headers:{authorization:`Bearer ${process.env.BOT_TOKEN}`}},r);assert.equal(r.code,200);assert.deepEqual(r.body,{ok:true,username:'example_bot'});const webhook=calls.find(c=>c.method==='setWebhook');assert.equal(webhook.data.url,'https://example.vercel.app/api/webhook');assert.equal(webhook.data.secret_token,process.env.WEBHOOK_SECRET);assert.equal(webhook.data.max_connections,1);assert.equal(JSON.stringify(r.body).includes(process.env.WEBHOOK_SECRET),false);}finally{global.fetch=original;}
});
