import {readFile} from 'node:fs/promises';
import {extractWithGroq} from '../lib/ai-parser.js';
const imageIndex=process.argv.indexOf('--image');
const imagePath=imageIndex>=0?process.argv[imageIndex+1]:null;
const textIndex=process.argv.indexOf('--text');
const text=textIndex>=0?process.argv[textIndex+1]:(imagePath?'':'قميص قطن رجالي\nالخامة: قطن 100%\nالألوان: أسود وأبيض\nالمقاسات: M وL وXL\nالكود: TS-104\nالسعر: 250 جنيه للقطعة');
try {
  const image=imagePath?{data:await readFile(imagePath),mediaType:/\.png$/i.test(imagePath)?'image/png':'image/jpeg'}:null;
  const result=await extractWithGroq({text,image,expectedCurrency:'EGP'});
  console.log(JSON.stringify(result,null,2));
  if(!result.supplierPrice) process.exitCode=2;
} catch(error) {console.error(error.code || 'check_failed',error.code?error.message:'تعذر اختبار Groq.');process.exitCode=1;}
