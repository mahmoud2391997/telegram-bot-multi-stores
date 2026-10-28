export const normalizeDigits = value => String(value).replace(/[٠-٩]/g, c => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/[۰-۹]/g, c => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replaceAll('٫', '.').replaceAll('٬', ',');
const numberPattern = '(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,2})?';
const currencyPattern = '(?:EGP|USD|SAR|AED|جنيه(?: مصري)?|جنية|ج|ج\\.م|ريال(?: سعودي)?|درهم(?: إماراتي)?|دولار|\\$)';
const labeledPrice = new RegExp(`(?:^|[|•؛#\\s❤️💰])(?:price|السعر|سعر)(?:\\s*(?:المورد|الجملة|القطعة|القطعه))?\\s*[:：=–-]?\\s*(${numberPattern})\\s*(?:${currencyPattern})?(?:\\s+(?:فقط|بس))?(?=\\s*(?:$|[|•؛—✨💰❤]))`, 'giu');
const currencyPriceLine = new RegExp(`^\\s*(${numberPattern})\\s*${currencyPattern}\\s*$`, 'iu');
const infoPatterns = {
  'اسم_المنتج': /(?:اسم المنتج|اسم_المنتج|المنتج|product(?: name)?)\s*[:：=]\s*([^\n|•؛]+)/iu,
  'الموديل': /(?:الموديل|موديل|model)\s*[:：=]\s*([^\n|•؛]+)/iu,
  'اللون': /(?:الألوان|الالوان|اللون|لون|colou?rs?)\s*[:：=]\s*([^\n|•؛]+)/iu,
  'المقاس': /(?:المقاسات|المقاس|مقاس|الحجم|sizes?)\s*[:：=]\s*([^\n|•؛]+)/iu,
  'السعة': /(?:السعة|سعة|التخزين|storage|capacity)\s*[:：=]\s*([^\n|•؛]+)/iu,
  'الكود': /(?:الكود|كود|code)\s*[:：=]?\s*([^\n|•؛]+)/iu,
  'الخامة': /(?:الخامة|الخامه|خامة|خامه|fabric|material)\s*[:：=]?\s*([^\n|•؛]+)/iu,
  'الحالة': /(?:الحالة|حالة|condition)\s*[:：=]\s*([^\n|•؛]+)/iu,
};
export function parsePost(input) {
  const prices=[];
  const lines=input.split('\n').map(line=>{
    const normalized=normalizeDigits(line);
    const currencyMatch=normalized.match(currencyPriceLine);
    if(currencyMatch) {prices.push(currencyMatch[1].replaceAll(',',''));return '';}
    const matches=[...normalized.matchAll(labeledPrice)];
    // Two price labels separated by a delimiter are handled independently.
    for(const match of matches) prices.push(match[1].replaceAll(',',''));
    let cleaned=line;
    for(const match of matches.reverse()) cleaned=cleaned.slice(0,match.index)+cleaned.slice(match.index+match[0].length);
    return cleaned.replace(/^[\s|•؛–-]+|[\s|•؛–-]+$/gu,'');
  });
  const body=lines.filter(Boolean).join('\n').trim();
  const unique=[...new Set(prices)];
  // A different currency-formatted amount left in the description is also ambiguous.
  const remainingCurrencyPrice=new RegExp(`${numberPattern}\\s*${currencyPattern}(?=\\s|$|[|•؛،])`,'iu').test(normalizeDigits(body));
  const info={};
  for(const [key,pattern] of Object.entries(infoPatterns)) info[key]=body.match(pattern)?.[1].trim() || '';
  if(!info['اسم_المنتج']) info['اسم_المنتج']=lines.find(line=>line && !Object.values(infoPatterns).some(pattern=>pattern.test(line))) || '';
  if(!info['السعة']) info['السعة']=[...normalizeDigits(body).matchAll(/\b\d+(?:\.\d+)?\s*(?:GB|TB)\b|[0-9]+\s*(?:جيجا(?:بايت)?|تيرا(?:بايت)?)/giu)].map(m=>m[0]).join(' / ');
  return {body,supplierPrice:!remainingCurrencyPrice && unique.length===1 && validPrice(unique[0]) ? unique[0] : null,info};
}
export function validPrice(value) { return /^\d{1,9}(\.\d{1,2})?$/.test(value) && Number(value)>0; }
export function parseCommission(input) {
  const value=normalizeDigits(input).trim().replaceAll('٪','%');
  const match=value.match(/^(\d{1,6}(?:\.\d{1,2})?)\s*(%)?$/);
  if(!match) return null;
  const amount=Number(match[1]);
  if(amount>(match[2]?1000:999999)) return null;
  return {type:match[2]?'percent':'fixed',amount};
}
const fields=['المحتوى','الوصف','السعر','سعر_المورد','العمولة','القسم','العملة',...Object.keys(infoPatterns)];
export function validFormat(format) {
  if(!format || format.length>600 || !format.includes('{السعر}')) return false;
  const stripped=format.replace(/\{([^{}]+)\}/g,(match,key)=>fields.includes(key)?'':match);
  return !/[{}]/.test(stripped);
}
export const defaultFormat='{المحتوى}\n\nالسعر: {السعر} {العملة}';
export function renderPost(parsed,channel,department) {
  const baseCents=Math.round(Number(parsed.supplierPrice)*100);
  const commissionCents=channel.commission.type==='percent' ? Math.round(baseCents*channel.commission.amount/100) : Math.round(channel.commission.amount*100);
  const money=cents=>(cents/100).toFixed(2).replace(/\.00$/,'');
  const values={...parsed.info,'المحتوى':parsed.body,'الوصف':parsed.body,'السعر':money(baseCents+commissionCents),'سعر_المورد':money(baseCents),'العمولة':money(commissionCents),'القسم':department.name,'العملة':department.currency};
  return channel.format.replace(/\{([^{}]+)\}/g,(match,key)=>values[key] ?? '');
}
