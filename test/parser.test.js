import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePost,parseCommission,validPrice,validFormat,renderPost,defaultFormat} from '../lib/parser.js';
const samples=[
  {text:'هاتف سامسونج A55\nاللون: أسود\nالسعة: 128 GB\nالسعر: ١٥٠٠ جنيه',price:'1500',name:'هاتف سامسونج A55',color:'أسود'},
  {text:'Product: Cotton shirt\nSize: XL\nColor: Blue\nPrice: 350 EGP',price:'350',name:'Cotton shirt',color:'Blue'},
  {text:'حذاء رياضي\nالمقاس: 42\nالسعر: ١٬٥٠٠٫٥٠ جنيه',price:'1500.50',name:'حذاء رياضي'},
  {text:'خلاط كهربائي\nموديل: MX-200\nالحالة: جديد\nالسعر: 800',price:'800',name:'خلاط كهربائي'},
  {text:'Laptop 16 GB\nPrice: 1,500 USD',price:'1500',name:'Laptop 16 GB'},
  {text:'سماعة بلوتوث | السعر: 300 جنيه',price:'300',name:'سماعة بلوتوث'},
  {text:'شنطة جلد\n450 جنيه',price:'450',name:'شنطة جلد'},
  {text:'هاتف تجريبي\nالسعر: 200\nسعر الجملة: 180',price:null,name:'هاتف تجريبي'},
];
for(const [index,sample] of samples.entries()) test(`تحليل منشور تجريبي ${index+1}`,()=>{
  const parsed=parsePost(sample.text);
  assert.equal(parsed.supplierPrice,sample.price);
  assert.equal(parsed.info['اسم_المنتج'],sample.name);
  if(sample.color) assert.equal(parsed.info['اللون'],sample.color);
});
test('لا يعتبر أرقام الموديل والسعة سعرًا',()=>{
  const p=parsePost('iPhone 16\n128 GB');assert.equal(p.supplierPrice,null);assert.equal(p.info['السعة'],'128 GB');
});
test('يرفض سعرًا غير واضح أو نطاق أسعار أو سعرًا سالبًا',()=>{
  for(const text of ['السعر: 100-200','السعر: -500','السعر: 1,50 جنيه','السعر: 500 جنيه\nالسعر القديم: 700 جنيه']) assert.equal(parsePost(text).supplierPrice,null,text);
});
test('يحتفظ بمعلومات المنتج في نفس سطر السعر',()=>{
  const p=parsePost('سماعة بلوتوث | السعر: 300 جنيه');assert.equal(p.body,'سماعة بلوتوث');
});
test('يتعرف على مقاس وموديل وحالة المنتج',()=>{
  const p=parsePost('اسم المنتج: قميص\nالمقاس: XL\nاللون: أزرق\nالموديل: C10\nالحالة: جديد\nالسعر: 250');
  assert.equal(p.info['المقاس'],'XL');assert.equal(p.info['الموديل'],'C10');assert.equal(p.info['الحالة'],'جديد');
});
test('يتحقق من السعر والعمولة بما فيها الأرقام العربية',()=>{
  for(const p of ['0','-1','1e4','NaN','12.345','1 EGP']) assert.equal(validPrice(p),false);
  assert.deepEqual(parseCommission('١٠٪'),{type:'percent',amount:10});
  assert.deepEqual(parseCommission('50.25'),{type:'fixed',amount:50.25});
  assert.deepEqual(parseCommission('0'),{type:'fixed',amount:0});
  for(const p of ['-10','ten','1001%','1e3','12.345']) assert.equal(parseCommission(p),null);
});
test('يحسب عمولة النسبة ويطبع الحقول العربية',()=>{
  const p=parsePost('اسم المنتج: هاتف\nاللون: أسود\nالسعر: 1500');
  assert.equal(renderPost(p,{format:'{اسم_المنتج} — {اللون}\n{السعر} {العملة}\n{القسم}',commission:{type:'percent',amount:10}},{name:'هواتف',currency:'جنيه'}),'هاتف — أسود\n1650 جنيه\nهواتف');
});
test('يحسب العمولة الثابتة مع تقريب العملة',()=>assert.equal(renderPost({body:'منتج',supplierPrice:'100.25'},{format:defaultFormat,commission:{type:'fixed',amount:10.5}},{name:'قسم',currency:'جنيه'}),'منتج\n\nالسعر: 110.75 جنيه'));
test('يرفض القوالب الناقصة والحقول غير المعروفة',()=>{
  assert.equal(validFormat(defaultFormat),true);
  for(const f of ['{المحتوى}','{السعر} {unknown}','{السعر} {','{السعر} '+ 'x'.repeat(600)]) assert.equal(validFormat(f),false);
});
test('يفهم صيغ أسعار الملابس الشائعة دون نقل منشورات الموردين كاملة',()=>{
  assert.equal(parsePost('طقم تجريبي\n❤️سعرالقطعه 320ج\nخامة: قطن\nكود 8589').supplierPrice,'320');
  assert.equal(parsePost('بلوزة تجريبية\nالسعر 150ج فقط').supplierPrice,'150');
  const p=parsePost('قميص تجريبي\nالخامة قطن\nالكود 123\n#السعر 70جنيه');
  assert.equal(p.supplierPrice,'70');assert.equal(p.info['الخامة'],'قطن');assert.equal(p.info['الكود'],'123');
  assert.equal(parsePost('قميص\nالسعر 150ج\nسعر الدستة 1800 جنيه').supplierPrice,null);
});
