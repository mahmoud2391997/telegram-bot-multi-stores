import {parsePost} from './parser.js';
import {aiEnabled,extractWithGroq,AnalysisError} from './ai-parser.js';
import {downloadTelegramPhoto} from './media.js';
export const currencyCode = currency => ({'جنيه':'EGP','EGP':'EGP','دولار':'USD','USD':'USD','ريال':'SAR','SAR':'SAR','درهم':'AED','AED':'AED'}[currency]);
export async function analyzeMessage(message,{currency,extract=extractWithGroq,download=downloadTelegramPhoto,enabled=aiEnabled()}={}) {
  const text=message.text || message.caption || '';
  if(!enabled) return {...parsePost(text),engine:'rules',reviewReason:null};
  try {
    const image=message.photo?await download(message):null;
    return await extract({text,image,expectedCurrency:currencyCode(currency)});
  } catch(error) {
    if(error instanceof AnalysisError) throw error;
    throw new AnalysisError('unavailable','تعذر تحميل الصورة أو تحليل المنشور. لم يُنشر شيء.');
  }
}
