import {normalizeDigits,validPrice} from './parser.js';

// Independent checks on supplier text, even when the model reports high confidence.
export function validateSource(text,value) {
  const reasons=[];
  const source=normalizeDigits(text).replace(/[أإآ]/g,'ا').replace(/\*/g,'');
  const selected=Number(value.supplier_price);
  const prices=[];
  for(const line of source.split('\n')) {
    for(const match of line.matchAll(/(?:السعر|سعر|price)\s*([^\d\n]{0,60}?)([+-]?\d[\d,.]*)/giu)) {
      const raw=match[2].replaceAll(',','');
      if(!validPrice(raw)) {reasons.push('صيغة سعر في المصدر غير صالحة.');continue;}
      const label=match[1]+' '+line.slice(match.index+match[0].length).split(/(?:السعر|سعر|price)/iu)[0].slice(0,30);
      const basis=/دست[ةه]|dozen/iu.test(label)?'dozen':/عبو[ةه]|حزم[ةه]|pack/iu.test(label)?'pack':/طقم|set/iu.test(label)?'set':/قطع[ةه]|piece|item/iu.test(label)?'item':null;
      prices.push({amount:Number(raw),basis});
    }
  }
  const piece=prices.filter(p=>p.basis==='item');
  for(const basis of [null,'item','set','dozen','pack']) {
    if(new Set(prices.filter(p=>p.basis===basis).map(p=>p.amount)).size>1) reasons.push('المصدر يحتوي أسعارًا مختلفة لنفس الوحدة أو الشرط.');
  }
  if(value.supplier_price!==null && prices.length && !prices.some(p=>p.amount===selected)) reasons.push('السعر المستخرج غير موجود ضمن أسعار المصدر الصريحة.');
  if(value.supplier_price!==null && piece.length && (value.price_basis!=='item' || !piece.some(p=>p.amount===selected))) reasons.push('يجب استخدام سعر القطعة الصريح دون اشتقاقه من الدستة.');
  const matching=prices.filter(p=>p.amount===selected && p.basis);
  if(matching.length && !matching.some(p=>p.basis===value.price_basis)) reasons.push('وحدة السعر المستخرجة تخالف الوحدة المذكورة في المصدر.');
  if(/(?:جمل[ةه]|wholesale)[\s\S]{0,100}(?:مشكل|retail)|(?:مشكل|retail)[\s\S]{0,100}(?:جمل[ةه]|wholesale)/iu.test(source) && (new Set(prices.map(p=>p.amount)).size>1 || /بزياد[ةه]|اضاف[ةه]/u.test(source))) reasons.push('يجب تحديد شرط الشراء قبل اختيار سعر الجملة أو المشكل.');
  const currencies=[];
  for(const [code,pattern] of [['EGP',/جنيه|جنية|\bEGP\b/iu],['USD',/دولار|\bUSD\b|\$/iu],['SAR',/ريال|\bSAR\b/iu],['AED',/درهم|\bAED\b/iu]]) if(pattern.test(source)) currencies.push(code);
  if(currencies.length>1) reasons.push('المصدر يحتوي أكثر من عملة ويحتاج مراجعة.');
  if(currencies.length===1 && value.currency!==currencies[0]) reasons.push('عملة الاستخراج لا تطابق العملة الصريحة في المصدر.');
  const codes=[...source.matchAll(/(?:الكود|كود|\bcode)\s*[:：#=-]?\s*([\p{L}\d][\p{L}\d._/-]*)/giu)].map(m=>m[1]);
  if(codes.length && (!value.code || !codes.every(code=>code.toLowerCase()===normalizeDigits(value.code).toLowerCase()))) reasons.push('كود المنتج لا يطابق المصدر حرفيًا أو توجد أكواد متعددة.');
  if(value.sizes.some(size=>/\d\s*[-–]\s*\d/.test(normalizeDigits(size)) && !/(?:كيلو|kg|(?:^|\s)ك(?:\s|$))/iu.test(size)) && /(?:تلبيس|سايز)[^\n]*\d[^\n]*(?:كيلو|ك(?:\s|$)|kg)/iu.test(source) && !/مقاسات?\s*[:：]/u.test(source)) reasons.push('نطاق الوزن يحتاج أن يبقى موضحًا كوزن، وليس كمقاس رقمي.');
  return [...new Set(reasons)];
}
