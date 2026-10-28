import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {evaluateFolder} from '../scripts/evaluate.mjs';
test('evaluation reports field comparisons and safe parser errors without publishing',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'bot-eval-'));let calls=0;
  try {
    await writeFile(join(folder,'one.json'),JSON.stringify({text:'قميص السعر 75 جنيه',expected:{supplierPrice:'75',decision:'publish',code:'0231'}}));
    await writeFile(join(folder,'two.json'),JSON.stringify({text:'بدون سعر'}));
    const report=await evaluateFolder(folder,{parse:async()=>{if(++calls===2) throw Error('private-provider-body');return {supplierPrice:'75',confidence:0.95,info:{'الكود':'0231'}};}});
    assert.deepEqual(report.summary,{samples:2,publish:1,review:1,errors:1,labeledChecks:3,correctChecks:3});
    assert.equal(JSON.stringify(report).includes('private-provider-body'),false);
  }finally{await rm(folder,{recursive:true});}
});
test('evaluation passes local image bytes and supports rules-only text',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'bot-eval-'));
  try {
    await writeFile(join(folder,'photo.jpg'),Buffer.from([255,216,255]));
    await writeFile(join(folder,'image.json'),JSON.stringify({text:'قميص',image:'photo.jpg'}));
    const report=await evaluateFolder(folder,{parse:async({image})=>{assert.equal(image.mediaType,'image/jpeg');assert.equal(image.data.length,3);return {supplierPrice:null,confidence:0.5,info:{}};}});
    assert.equal(report.summary.review,1);
    await writeFile(join(folder,'image.json'),JSON.stringify({text:'قميص\nالسعر: 75 جنيه'}));
    assert.equal((await evaluateFolder(folder,{rules:true})).summary.publish,1);
  }finally{await rm(folder,{recursive:true});}
});
