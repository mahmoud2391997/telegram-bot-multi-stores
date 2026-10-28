import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeExtraction} from '../lib/ai-parser.js';

const product=patch=>({status:'ready',product_name:'ليجن',description:'ليجن',supplier_price:'75',currency:'EGP',price_evidence:'سعر القطعة ٧٥ جنيه',price_basis:'item',code:'0231',model:null,material:null,colors:[],sizes:[],capacity:null,condition:null,warnings:[],confidence:0.99,...patch});
const run=(text,patch={},options={})=>normalizeExtraction(product(patch),{text,expectedCurrency:'EGP',...options});

test('يقبل سعر القطعة العربي الصريح مع الدستة دون قسمة',()=>{
  const p=run('ليجن\nسعر الدستة ٩٠٠ جنيه\nسعر القطعة ٧٥ جنيه\nكود 0231');
  assert.equal(p.supplierPrice,'75');
});
test('يمنع السعر المشتق حتى عندما يؤكد النموذج صحته مع صورة',()=>{
  const p=run('سعر الدستة 900 جنيه',{price_evidence:'سعر القطعة 75 جنيه'},{hasImage:true});
  assert.equal(p.supplierPrice,null);assert.match(p.reviewReason,/أسعار المصدر|وحدة السعر/);
});
test('وجود الصورة لا يتجاوز تعارض أسعار القطعة في الوصف',()=>{
  const p=run('سعر القطعة 75 جنيه\nسعر القطعة 95 جنيه',{}, {hasImage:true});
  assert.equal(p.supplierPrice,null);assert.match(p.reviewReason,/أسعارًا مختلفة/);
});
test('يرفض اختيار الدستة عندما يوجد سعر قطعة صريح',()=>{
  const p=run('سعر الدستة 900 جنيه\nسعر القطعة 75 جنيه',{supplier_price:'900',price_basis:'dozen',price_evidence:'سعر الدستة 900 جنيه'});
  assert.equal(p.supplierPrice,null);assert.match(p.reviewReason,/سعر القطعة الصريح/);
});
test('يرفض سعر الجملة مقابل المشكل وتكلفة الزيادة',()=>{
  for(const text of ['سعر القطعة فالجملة 450 جنيه\nسعر القطعة فالمشكل 485 جنيه','السعر في الجملة 450 جنيه\nالجملة مشكل بزيادة 30ج']) {
    const p=run(text,{supplier_price:'450',price_evidence:text.split('\n')[0]});
    assert.equal(p.supplierPrice,null);assert.match(p.reviewReason,/شرط الشراء|أسعارًا مختلفة/);
  }
});
test('لا يسمح للنموذج بإخفاء عملة المصدر أو تبديلها',()=>{
  for(const currency of [null,'EGP']) {
    const p=run('سعر القطعة 75 دولار',{currency,price_evidence:'سعر القطعة 75 دولار'});
    assert.equal(p.supplierPrice,null);assert.match(p.reviewReason,/عملة الاستخراج/);
  }
});
test('يرفض تعدد العملات حتى إن اختار النموذج سعرًا صحيحًا',()=>{
  const p=run('سعر القطعة 75 جنيه\nيعادل 2 دولار',{}, {hasImage:true});
  assert.equal(p.supplierPrice,null);assert.match(p.reviewReason,/أكثر من عملة/);
});
test('يحافظ على صفر الكود ويرفض تبديله أو تعدده',()=>{
  for(const [text,code] of [['سعر القطعة 75 جنيه\nكود 0231','231'],['سعر القطعة 75 جنيه\nكود 0231\nكود 0232','0231']]) {
    const p=run(text,{code});assert.equal(p.supplierPrice,null);assert.match(p.reviewReason,/كود المنتج/);
  }
});
test('لا يحول وزن العميل إلى مقاس رقمي',()=>{
  const p=run('فري سايز 65 ل80 ك\nسعر القطعة 75 جنيه',{sizes:['Free size 65-80']});
  assert.equal(p.supplierPrice,null);assert.match(p.reviewReason,/نطاق الوزن/);
  assert.equal(run('المقاسات: 38-42\nسعر القطعة 75 جنيه',{sizes:['38-42']}).supplierPrice,'75');
});
test('يسمح بعملة القسم عند غياب عملة المصدر وبسعر مزين بالرموز',()=>{
  const p=run('سعر الدسته جمله 420\nسعر القطعه 👍👍35\nكود 1133',{supplier_price:'35',currency:null,price_evidence:'سعر القطعه 👍👍35',code:'1133'});
  assert.equal(p.supplierPrice,'35');
});
test('يتحقق من وحدة السعر المكتوبة بعد المبلغ أيضًا',()=>{
  const text='السعر 900 جنيه للدستة';
  assert.equal(run(text,{supplier_price:'900',price_evidence:text,price_basis:'item'}).supplierPrice,null);
  assert.equal(run(text,{supplier_price:'900',price_evidence:text,price_basis:'dozen'}).supplierPrice,'900');
});
