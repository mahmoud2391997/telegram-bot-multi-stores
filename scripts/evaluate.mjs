import {readdir,readFile,realpath,writeFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {extractWithGroq} from '../lib/ai-parser.js';
import {parsePost} from '../lib/parser.js';

// Parser-only evaluation: this module never imports a Telegram publishing function.
export async function evaluateFolder(folder,{parse=extractWithGroq,rules=false}={}) {
  const root=await realpath(folder);const rows=[];
  for(const filename of (await readdir(root)).filter(n=>n.endsWith('.json')).sort()) {
    try {
      const sample=JSON.parse(await readFile(resolve(root,filename),'utf8'));
      if(typeof sample.text!=='string' || sample.text.length>12000) throw Error('Invalid sample text');
      let image=null;
      if(sample.image) {
        if(typeof sample.image!=='string') throw Error('Invalid image path');
        const path=await realpath(resolve(root,sample.image));const rel=relative(root,path);
        if(rel.startsWith('..')||isAbsolute(rel)) throw Error('Image must remain inside the sample folder');
        const data=await readFile(path);if(data.length>8*1024*1024) throw Error('Image exceeds limit');
        const mediaType=/\.png$/i.test(path)?'image/png':/\.webp$/i.test(path)?'image/webp':/\.jpe?g$/i.test(path)?'image/jpeg':null;
        if(!mediaType) throw Error('Unsupported image extension');image={data,mediaType};
      }
      if(rules&&image) throw Error('Rules cannot evaluate image content');
      const result=rules?{...parsePost(sample.text),engine:'rules'}:await parse({text:sample.text,image,expectedCurrency:sample.currency || 'EGP'});
      const decision=result.supplierPrice && !result.reviewReason && (result.confidence===undefined || result.confidence>=0.85)?'publish':'review';
      const actual={supplierPrice:result.supplierPrice,decision,code:result.info?.['الكود'] || ''};
      const expected=sample.expected;
      const checks=expected?Object.entries(expected).map(([key,value])=>({field:key,expected:value,actual:actual[key],pass:actual[key]===value})):[];
      rows.push({sample:filename,source:sample.source || null,decision,confidence:result.confidence ?? null,supplierPrice:result.supplierPrice,candidatePrice:result.candidatePrice ?? null,fields:result.info || {},reason:result.reviewReason || null,checks,error:null});
    }catch(error) {
      // Provider bodies and raw exceptions can contain credentials: report only a safe code.
      rows.push({sample:filename,decision:'review',confidence:null,supplierPrice:null,fields:{},checks:[],error:error.code || 'evaluation_failed'});
    }
  }
  const checks=rows.flatMap(r=>r.checks);
  return {rows,summary:{samples:rows.length,publish:rows.filter(r=>r.decision==='publish').length,review:rows.filter(r=>r.decision==='review').length,errors:rows.filter(r=>r.error).length,labeledChecks:checks.length,correctChecks:checks.filter(c=>c.pass).length}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const folder=process.argv[2];
  if(!folder) {console.error('Usage: node --env-file=.env.local scripts/evaluate.mjs <folder> [--rules] [--output report.json]');process.exitCode=1;}
  else {
    try {
      const report=await evaluateFolder(folder,{rules:process.argv.includes('--rules')});
      console.table(report.rows.map(r=>({sample:r.sample,name:r.fields['اسم_المنتج'] || '',price:r.supplierPrice,code:r.fields['الكود'] || '',material:r.fields['الخامة'] || '',sizes:r.fields['المقاس'] || '',confidence:r.confidence,decision:r.decision,error:r.error,reason:r.reason || ''})));
      console.log(JSON.stringify(report.summary));
      const output=process.argv.indexOf('--output');if(output>=0) {if(!process.argv[output+1]) throw Error();await writeFile(resolve(process.argv[output+1]),JSON.stringify(report,null,2)+'\n');}
      if(report.summary.errors) process.exitCode=1;
    }catch {console.error('Evaluation failed. Check the sample folder and output path.');process.exitCode=1;}
  }
}
