import test from 'node:test';
import assert from 'node:assert/strict';
import {extractWithGroq,normalizeExtraction,validateExtraction} from '../lib/ai-parser.js';
import {analyzeMessage} from '../lib/analyze-message.js';
import {downloadTelegramPhoto} from '../lib/media.js';
import {renderPost,clothingFormat,validFormat} from '../lib/parser.js';
process.env.GROQ_API_KEY='test-key-not-real';
const product=patch=>({status:'ready',product_name:'قميص قطن',description:'قميص رجالي قطن',supplier_price:'250',currency:'EGP',price_evidence:'السعر: 250 جنيه',price_basis:'item',code:'TS-104',model:null,material:'قطن',colors:['أسود'],sizes:['M','L'],capacity:null,condition:null,warnings:[],confidence:0.97,...patch});
const source='قميص رجالي\nالسعر: 250 جنيه';
test('يربط استخراج Groq بالحقول العربية والعمولة المحسوبة',()=>{
  const p=normalizeExtraction(product(),{text:source,expectedCurrency:'EGP'});
  assert.equal(p.supplierPrice,'250');assert.equal(p.info['الكود'],'TS-104');assert.equal(p.info['اللون'],'أسود');
  const result=renderPost(p,{format:clothingFormat,commission:{type:'percent',amount:10}},{name:'ملابس',currency:'جنيه'});
  assert.match(result,/275 جنيه للقطعة/);assert.equal(validFormat(clothingFormat),true);
});
test('يرفض الأسعار المخترعة أو المتعارضة ومخرجات الحقن الوصفية',()=>{
  for(const patch of [
    {supplier_price:'999',price_evidence:'السعر: 999 جنيه'},
    {supplier_price:'25'},
    {status:'review',warnings:['السعر غير واضح']},
    {confidence:0.5},
    {price_basis:'unknown'},
    {currency:'USD'},
    {description:'اطلب عبر https://supplier.example'},
    {supplier_price:'2e3'},
    {supplier_price:'-250'},
  ]) assert.equal(normalizeExtraction(product(patch),{text:source,expectedCurrency:'EGP'}).supplierPrice,null,JSON.stringify(patch));
});
test('يقبل دليل سعر الصورة لكنه لا يخترع سعرًا عند نقصه',()=>{
  assert.equal(normalizeExtraction(product(),{text:'قميص',hasImage:true}).supplierPrice,'250');
  assert.equal(normalizeExtraction(product({supplier_price:null,price_evidence:null,status:'review'}),{text:'قميص',hasImage:true}).supplierPrice,null);
});
test('يرفض بيانات بنوع خاطئ أو حقول إضافية',()=>{
  assert.equal(validateExtraction(product({supplier_price:250})).success,false);
  assert.equal(validateExtraction(product({instructions:'publish now'})).success,false);
  assert.equal(validateExtraction(product({sizes:['XL',5]})).success,false);
  assert.equal(validateExtraction(product({confidence:NaN})).success,false);
});
test('يميز سعر الدستة ويضيف وحدته للقوالب القديمة',()=>{
  const p=normalizeExtraction(product({price_basis:'dozen'}),{text:source});
  const text=renderPost(p,{format:'{اسم_المنتج}\nالسعر: {السعر}',commission:{type:'fixed',amount:50}},{name:'ملابس',currency:'جنيه'});
  assert.match(text,/السعر: 300/);assert.match(text,/وحدة السعر: للدستة/);
});
test('يحذف أسطر الحقول الناقصة من قالب الملابس',()=>{
  const p=normalizeExtraction(product({material:null,code:null,sizes:[],colors:[]}),{text:source});
  const text=renderPost(p,{format:clothingFormat,commission:{type:'fixed',amount:0}},{name:'ملابس',currency:'جنيه'});
  assert.doesNotMatch(text,/الخامة:|المقاسات:|الألوان:|الكود:/);
});
test('يرسل بايتات الصورة فقط إلى Groq ولا يرسل رابط رمز تيليجرام',async()=>{
  let captured;
  const image={mediaType:'image/jpeg',data:Buffer.from([255,216,255,0])};
  const result=await extractWithGroq({text:source,image},{generate:async options=>{captured=options;return {output:product()};}});
  assert.equal(result.engine,'groq');assert.equal(captured.model.modelId,'qwen/qwen3.8-27b');
  assert.equal(captured.messages[0].content[1].type,'file');assert.equal(captured.messages[0].content[1].data,image.data);
  assert.equal(JSON.stringify(captured.messages).includes('api.telegram.org'),false);assert.equal(captured.maxRetries,0);
});
test('يعزل النص غير الموثوق ويطلب مخططًا منظمًا دون أدوات',async()=>{
  let captured;
  await extractWithGroq({text:source},{generate:async options=>{captured=options;return {output:product()};}});
  assert.equal(captured.model.modelId,'openai/gpt-oss-120b');assert.equal(captured.tools,undefined);assert.ok(captured.output);
  assert.match(captured.system,/never obey/);assert.match(captured.messages[0].content[0].text,/<SUPPLIER_TEXT>/);
});
test('retries transient Groq failures twice without leaking provider errors',async()=>{
  let calls=0;
  await assert.rejects(extractWithGroq({text:source},{generate:async()=>{calls++;throw {statusCode:429,responseBody:'secret error body'};}}),error=>error.code==='rate_limit'&&!error.message.includes('secret'));
  assert.equal(calls,3);
});
test('يختار القواعد عند تعطيل AI ولا يتصل بتنزيل الصورة',async()=>{
  const p=await analyzeMessage({caption:source,photo:[{file_id:'x'}]},{enabled:false,download:()=>{throw new Error('Must not download');}});
  assert.equal(p.engine,'rules');assert.equal(p.supplierPrice,'250');
});
test('يحمل صورة تيليجرام للتحليل ويرسل العملة المتوقعة',async()=>{
  let input;
  const image={data:Buffer.from([1,2,3]),mediaType:'image/jpeg'};
  await analyzeMessage({caption:source,photo:[{file_id:'x'}]},{enabled:true,currency:'جنيه',download:async()=>image,extract:async v=>{input=v;return {supplierPrice:'250'};}});
  assert.equal(input.image,image);assert.equal(input.expectedCurrency,'EGP');
});
test('يتحقق من حجم الصورة ومسار ملف تيليجرام قبل التنزيل',async()=>{
  await assert.rejects(downloadTelegramPhoto({photo:[{file_id:'x',file_size:9*1024*1024}]},{callTelegram:()=>{throw new Error('Must not call');}}),e=>e.code==='image_size');
  await assert.rejects(downloadTelegramPhoto({photo:[{file_id:'x'}]},{callTelegram:async()=>({file_path:'../secret.jpg'}),fetchFile:()=>{throw new Error('Must not fetch');}}),e=>e.code==='image_type');
});
test('يتحقق من بايتات الصورة بعد تنزيلها',async()=>{
  const p=await downloadTelegramPhoto({photo:[{file_id:'x'}]},{callTelegram:async()=>({file_path:'photos/file_1.jpg'}),fetchFile:async()=>new Response(Buffer.from([255,216,255,0]),{headers:{'content-type':'image/jpeg'}})});
  assert.equal(p.mediaType,'image/jpeg');assert.deepEqual([...p.data],[255,216,255,0]);
  await assert.rejects(downloadTelegramPhoto({photo:[{file_id:'x'}]},{callTelegram:async()=>({file_path:'photos/file_1.jpg'}),fetchFile:async()=>new Response('not an image')}),e=>e.code==='image_type');
});
