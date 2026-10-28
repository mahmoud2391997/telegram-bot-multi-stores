import test from 'node:test';
import assert from 'node:assert/strict';
import {holdPost,canApprove} from '../lib/review.js';
const message={chat:{id:-1,type:'channel'},message_id:7,caption:'منتج',photo:[{file_id:'s'},{file_id:'l',file_unique_id:'u'}]};
test('held entries retain original text and Telegram media with a strict cap',()=>{
  const config={};const parsed={info:{},supplierPrice:null};
  const held=holdPost(config,message,parsed);assert.equal(held.data.photo.length,1);assert.equal(held.data.photo[0].file_id,'l');
  assert.equal(held.data.caption,'منتج');assert.equal(held.parsed,parsed);
  assert.ok(holdPost(config,message,parsed));assert.equal(holdPost(config,message,parsed),null);
});
test('manual approval cannot bypass low confidence or unsafe extracted fields',()=>{
  for(const parsed of [{supplierPrice:'75',confidence:0.84},{supplierPrice:'75',confidence:0.99,approvalBlocked:true},{supplierPrice:null,confidence:0.99}]) assert.equal(canApprove({parsed}),false);
  assert.equal(canApprove({parsed:{supplierPrice:'75',confidence:0.95}}),true);
});
