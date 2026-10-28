import test from 'node:test';
import assert from 'node:assert/strict';
import {claimPost,fingerprints,findDuplicate} from '../lib/post-log.js';
const message={chat:{id:-100},message_id:1,text:'منتج  السعر 75',photo:[{file_id:'a',file_unique_id:'stable'}]};
test('claims by update ID and source/message pair',()=>{
  const config={};assert.ok(claimPost(config,message,10));
  assert.equal(claimPost(config,{...message,message_id:2},10),null);
  assert.equal(claimPost(config,message,11),null);
  assert.ok(claimPost(config,{...message,chat:{id:-200}},12));
});
test('duplicate window respects time, supplier, status and stable image identity',()=>{
  const config={};const first=claimPost(config,message,1);first.status='sent';first.time=1000;
  const next=claimPost(config,{...message,message_id:2,caption:'new caption',text:'different text'},2);
  assert.equal(findDuplicate(config,next,2000),first);
  assert.equal(findDuplicate(config,next,1000+25*3600000),null);
  first.status='failed';assert.equal(findDuplicate(config,next,2000),null);
  first.status='sent';next.source='other';assert.equal(findDuplicate(config,next,2000),null);
});
test('hashes normalized text and stable file identity without storing secrets',()=>{
  assert.deepEqual(fingerprints(message),fingerprints({...message,text:'منتج السعر 75',photo:[{file_id:'new',file_unique_id:'stable'}]}));
  assert.notEqual(fingerprints(message).imageHash,fingerprints({...message,photo:[{file_unique_id:'other'}]}).imageHash);
});
test('partial failure still blocks duplicate content if any destination sent or is uncertain',()=>{
  const config={};const first=claimPost(config,message,1);first.status='failed';
  const next=claimPost(config,{...message,message_id:2},2);
  config.receipts=[{source:first.source,message:first.message,target:'a',status:'uncertain'}];
  assert.equal(findDuplicate(config,next),first);
});
