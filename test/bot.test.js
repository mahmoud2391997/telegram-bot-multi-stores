import test from 'node:test';
import assert from 'node:assert/strict';
import {handleUpdate} from '../lib/bot.js';
import {emptyConfig,encodeConfig,decodeConfig} from '../lib/settings.js';
import {defaultFormat} from '../lib/parser.js';
process.env.OWNER_ID='42';
process.env.AI_PARSING_ENABLED='false';
process.env.WEBHOOK_SECRET='test-secret-for-local-checks-only';
const configText=config=>`إعدادات_البوت:${encodeConfig(config)}`;
function fixture(config=emptyConfig(),options={}) {
  let pinned=options.uninitialized?null:{message_id:1,text:configText(config)};
  const calls=[];
  const original=global.fetch;
  global.fetch=async(url,request)=>{
    if(String(url).startsWith('https://api.groq.com/')) {
      const data=JSON.parse(request.body);calls.push({method:'groq',data});
      if(options.groqFailure) return new Response('{}',{status:503,headers:{'content-type':'application/json'}});
      return new Response(JSON.stringify({id:'chatcmpl-test',object:'chat.completion',created:1,model:data.model,choices:[{index:0,message:{role:'assistant',content:JSON.stringify(options.aiOutput)},finish_reason:'stop'}],usage:{prompt_tokens:20,completion_tokens:40,total_tokens:60}}),{headers:{'content-type':'application/json'}});
    }
    if(String(url).includes('/file/bot')) return new Response(Buffer.from([255,216,255,0]),{headers:{'content-type':'image/jpeg'}});
    const method=url.split('/').at(-1),data=request?.body?JSON.parse(request.body):{};
    calls.push({method,data});
    let result=true;
    if(method==='getChat') result=String(data.chat_id)==='42'?{id:42,pinned_message:pinned}:{id:Number(data.chat_id)||-1001,title:'قناة تجريبية',type:'channel'};
    if(method==='getMe') result={id:99};
    if(method==='getFile') result={file_path:'photos/file_1.jpg',file_size:4};
    if(method==='getChatMember') result={status:'administrator',can_post_messages:options.canPost!==false};
    if(method==='sendMessage') {
      if(String(data.chat_id)==='-1002' && options.rejectDestination) return {json:async()=>({ok:false,error_code:429,parameters:{retry_after:999}})};
      if(String(data.chat_id)==='-1002' && options.failDestination) throw new Error('Network timeout');
      result={message_id:calls.length,text:data.text};
    }
    if(method==='pinChatMessage') {const sent=calls.find(c=>c.method==='sendMessage'&&c.data.text.includes('إعدادات_البوت:'));pinned={message_id:data.message_id,text:sent.data.text};}
    if(method==='editMessageText') pinned={message_id:data.message_id,text:data.text};
    return {json:async()=>({ok:true,result})};
  };
  return {calls,read:()=>decodeConfig(pinned.text.split('إعدادات_البوت:')[1]),restore:()=>{global.fetch=original;}};
}
let updateId=1;
const owner=text=>handleUpdate({update_id:updateId++,message:{chat:{id:42,type:'private'},from:{id:42},text}});
const post=(text='هاتف\nاللون: أسود\nالسعر: 100 جنيه')=>handleUpdate({update_id:updateId++,channel_post:{chat:{id:-1001,type:'channel'},message_id:12,text}});
function configured() {
  const c=emptyConfig();c.departments=[{id:'d1',name:'هواتف',currency:'جنيه'}];
  c.channels=[{id:'-1001',title:'المورد',role:'source',department:'d1'},{id:'-1002',title:'المتجر',role:'destination',department:'d1',format:defaultFormat,commission:{type:'percent',amount:10}}];return c;
}
test('يتجاهل أوامر غير المالك دون أي اتصالات',async()=>{
  const f=fixture();try {await handleUpdate({message:{chat:{id:7,type:'private'},from:{id:7},text:'/start'}});assert.equal(f.calls.length,0);}finally{f.restore();}
});
test('Groq failure is persisted once and offers an owner retry button',async()=>{
  process.env.AI_PARSING_ENABLED='true';process.env.GROQ_API_KEY='test-key-not-real';
  const f=fixture(configured(),{groqFailure:true});
  try {
    await post();await post();
    assert.equal(f.calls.filter(c=>c.method==='groq').length,3);
    assert.equal(f.calls.filter(c=>c.data.chat_id==='-1002').length,0);
    assert.equal(f.read().posts[0].status,'failed');
    assert.ok(f.calls.some(c=>c.data.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data.startsWith('retry:')));
  }finally{f.restore();process.env.AI_PARSING_ENABLED='false';delete process.env.GROQ_API_KEY;}
});
test('a definite rejected send can be retried with one authorized tap only',async()=>{
  const options={rejectDestination:true};const f=fixture(configured(),options);
  try {
    await post();assert.equal(f.read().posts[0].status,'failed');options.rejectDestination=false;
    const update={update_id:99999,callback_query:{id:'tap',from:{id:42},message:{chat:{id:42}},data:'retry:-1001:12'}};
    await handleUpdate(update);await handleUpdate(update);
    assert.equal(f.calls.filter(c=>c.data.chat_id==='-1002').length,2);
    assert.equal(f.read().posts[0].status,'sent');
  }finally{f.restore();}
});
test('ينشئ الإعدادات في رسالة مثبتة دون قاعدة بيانات',async()=>{
  const f=fixture(undefined,{uninitialized:true});try{await owner('/start');assert.equal(f.read().v,1);assert.ok(f.calls.some(c=>c.method==='pinChatMessage'));}finally{f.restore();}
});
test('ينشئ قسمًا ثم يضيف قناة نشر مع الصيغة والعمولة من المحادثة',async()=>{
  const f=fixture();try{
    await owner('إضافة قسم');await owner('هواتف');await owner('جنيه مصري');
    await owner('إضافة قناة');await owner('وجهة (نشر)');await owner('هواتف');
    assert.ok(f.calls.some(c=>c.method==='sendMessage'&&c.data.reply_markup?.keyboard?.some(row=>row.some(b=>b.request_chat))));
    await owner('-1002');await owner('١٠٪');await owner('{اسم_المنتج}\nالسعر: {السعر} {العملة}');
    assert.equal(f.read().channels.length,0);
    await owner('حفظ القناة');
    const channel=f.read().channels[0];assert.equal(channel.id,'-1002');assert.deepEqual(channel.commission,{type:'percent',amount:10});assert.equal(channel.format,'{اسم_المنتج}\nالسعر: {السعر} {العملة}');assert.equal(f.read().wizard,null);
  }finally{f.restore();}
});
test('يقبل مشاركة قناة من منتقي تيليجرام ويتحقق من رقم الطلب',async()=>{
  const c=emptyConfig();c.departments=[{id:'d1',name:'هواتف',currency:'جنيه'}];const f=fixture(c);
  try{
    await owner('إضافة قناة');await owner('مصدر (استقبال)');await owner('هواتف');
    const requestId=f.read().wizard.requestId;
    await handleUpdate({message:{chat:{id:42,type:'private'},from:{id:42},chat_shared:{request_id:requestId+1,chat_id:-1001}}});
    assert.equal(f.read().wizard.step,'chat');
    await handleUpdate({message:{chat:{id:42,type:'private'},from:{id:42},chat_shared:{request_id:requestId,chat_id:-1001}}});
    await owner('حفظ القناة');assert.equal(f.read().channels[0].role,'source');
  }finally{f.restore();}
});
test('يرفض قناة نشر بلا صلاحية إرسال',async()=>{
  const c=emptyConfig();c.departments=[{id:'d1',name:'هواتف',currency:'جنيه'}];const f=fixture(c,{canPost:false});
  try{await owner('إضافة قناة');await owner('وجهة (نشر)');await owner('هواتف');await owner('-1002');assert.equal(f.read().wizard.step,'chat');assert.equal(f.read().channels.length,0);assert.match(f.calls.at(-1).data.text,/صلاحية/);}finally{f.restore();}
});
test('ينشر فورًا بسعر المورد مضافًا إليه العمولة ولا يكرر المحاولة الحديثة',async()=>{
  const f=fixture(configured());try{
    await post();await post();const sent=f.calls.filter(c=>c.method==='sendMessage'&&c.data.chat_id==='-1002');
    assert.equal(sent.length,1);assert.match(sent[0].data.text,/السعر: 110 جنيه/);assert.doesNotMatch(sent[0].data.text,/السعر: 100/);assert.equal(f.read().receipts[0].status,'sent');
  }finally{f.restore();}
});
test('يتجنب تكرار الإرسال عند انقطاع الشبكة',async()=>{
  const f=fixture(configured(),{failDestination:true});try{await post();await post();assert.equal(f.calls.filter(c=>c.method==='sendMessage'&&c.data.chat_id==='-1002').length,1);assert.equal(f.read().receipts[0].status,'uncertain');}finally{f.restore();}
});
test('لا ينشر سعرًا غير واضح وينبه المالك',async()=>{
  const f=fixture(configured());try{await post('هاتف 128 GB\nالسعر عند الطلب');assert.equal(f.calls.filter(c=>c.data.chat_id==='-1002').length,0);assert.match(f.calls.at(-1).data.text,/لعدم وجود سعر مورد واضح/);}finally{f.restore();}
});
test('ينشر الصورة مع الوصف والسعر المحسوب',async()=>{
  const f=fixture(configured());try{await handleUpdate({channel_post:{chat:{id:-1001,type:'channel'},message_id:15,caption:'هاتف\nالسعر: 200 جنيه',photo:[{file_id:'small'},{file_id:'large'}]}});const sent=f.calls.find(c=>c.method==='sendPhoto');assert.equal(sent.data.photo,'large');assert.match(sent.data.caption,/220 جنيه/);}finally{f.restore();}
});
test('يعدل الصيغة والعمولة ويحذف القناة بتأكيد داخل البوت',async()=>{
  const f=fixture(configured());try{
    await owner('تعديل قناة');await owner('المتجر (-1002)');await owner('50');await owner('الصيغة الافتراضية');await owner('حفظ القناة');
    assert.deepEqual(f.read().channels.find(c=>c.id==='-1002').commission,{type:'fixed',amount:50});
    await owner('حذف قناة');await owner('المتجر (-1002)');assert.equal(f.read().channels.length,2);await owner('تأكيد حذف القناة');assert.equal(f.read().channels.length,1);
  }finally{f.restore();}
});
test('يرفض إعدادات مثبتة تم التلاعب بها',async()=>{
  const token=encodeConfig(configured());assert.equal(decodeConfig(token.slice(0,-5)+'wrong'),null);assert.equal(decodeConfig('not-config'),null);
});
test('يعرض قنوات الملابس العامة دون تفعيلها تلقائيًا',async()=>{
  const f=fixture();try{await owner('قنوات ملابس مقترحة');assert.match(f.calls.at(-1).data.text,/https:\/\/t.me\/omnohaa/);assert.equal(f.read().channels.length,0);}finally{f.restore();}
});
test('يجرّب التحليل والعمولة دون النشر للوجهات',async()=>{
  const f=fixture(configured());try{await owner('تجربة التحليل');await owner('المتجر (-1002)');await owner('قميص\nاللون: أزرق\nالسعر: 100 جنيه');assert.ok(f.calls.some(c=>c.method==='sendMessage'&&/110 جنيه/.test(c.data.text)));assert.equal(f.calls.filter(c=>c.data.chat_id==='-1002').length,0);assert.equal(f.read().wizard,null);}finally{f.restore();}
});

const aiProduct = patch => ({status:'ready',product_name:'قميص',description:'قميص قطن أزرق',supplier_price:'250',currency:'EGP',price_evidence:'PRICE 250 EGP',price_basis:'item',code:'TS-104',model:null,material:'قطن',colors:['أزرق'],sizes:['M','L'],capacity:null,condition:null,warnings:[],confidence:0.96,...patch});
test('ينشر صورة بلا وصف بعد تحليل Groq ويحسب العمولة بالكود',async()=>{
  process.env.AI_PARSING_ENABLED='true';process.env.GROQ_API_KEY='test-key-not-real';
  const f=fixture(configured(),{aiOutput:aiProduct()});
  try{
    const update={channel_post:{chat:{id:-1001,type:'channel'},message_id:40,photo:[{file_id:'image'}]}};
    await handleUpdate(update);await handleUpdate(update);
    const sent=f.calls.filter(c=>c.method==='sendPhoto');assert.equal(sent.length,1);assert.match(sent[0].data.caption,/275 جنيه/);
    const requests=f.calls.filter(c=>c.method==='groq');assert.equal(requests.length,1);assert.equal(requests[0].data.model,'qwen/qwen3.8-27b');
    assert.ok(JSON.stringify(requests[0].data.messages).includes('data:image/jpeg;base64,'));
    assert.equal(JSON.stringify(requests[0].data.messages).includes('api.telegram.org'),false);
  }finally{f.restore();process.env.AI_PARSING_ENABLED='false';delete process.env.GROQ_API_KEY;}
});
test('يتوقف للمراجعة إذا أعاد Groq أسعارًا غامضة',async()=>{
  process.env.AI_PARSING_ENABLED='true';process.env.GROQ_API_KEY='test-key-not-real';
  const f=fixture(configured(),{aiOutput:aiProduct({status:'review',warnings:['يوجد سعران مختلفان']})});
  try{await post('قميص بسعرين');assert.equal(f.calls.filter(c=>c.method==='sendMessage'&&c.data.chat_id==='-1002').length,0);assert.match(f.calls.at(-1).data.text,/تحتاج مراجعة/);}
  finally{f.restore();process.env.AI_PARSING_ENABLED='false';delete process.env.GROQ_API_KEY;}
});
test('يتيح تجربة قالب الملابس دون إضافة وجهة',async()=>{
  const f=fixture();try{await owner('تجربة التحليل');assert.equal(f.read().wizard.step,'test_post');await owner('قميص\nالسعر: 250 جنيه');assert.ok(f.calls.some(c=>c.method==='sendMessage'&&/قالب الملابس التجريبي/.test(c.data.text)));assert.equal(f.read().channels.length,0);}finally{f.restore();}
});
test('يقبل اختيار المصدر المكتوب بالعربية حتى مع علامات الاقتباس',async()=>{
  const c=emptyConfig();c.departments=[{id:'d1',name:'ملابس',currency:'جنيه'}];
  for(const value of ['استقبال','«مصدر (استقبال)»']){
    const f=fixture(c);try{await owner('إضافة قناة');await owner(value);assert.equal(f.read().wizard.step,'department');assert.equal(f.read().wizard.channel.role,'source');}finally{f.restore();}
  }
});
