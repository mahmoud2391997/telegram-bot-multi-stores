import test from 'node:test';
import assert from 'node:assert/strict';
import {claimPost,fingerprints} from '../lib/post-log.js';
const message={chat:{id:-100},message_id:1,text:'منتج  السعر 75',photo:[{file_id:'a',file_unique_id:'stable'}]};
test('claims by update ID and source/message pair',()=>{
  const config={};assert.ok(claimPost(config,message,10));
  assert.equal(claimPost(config,{...message,message_id:2},10),null);
  assert.equal(claimPost(config,message,11),null);
  assert.ok(claimPost(config,{...message,chat:{id:-200}},12));
});
test('hashes normalized text and stable file identity without storing secrets',()=>{
  assert.deepEqual(fingerprints(message),fingerprints({...message,text:'منتج السعر 75',photo:[{file_id:'new',file_unique_id:'stable'}]}));
  assert.notEqual(fingerprints(message).imageHash,fingerprints({...message,photo:[{file_unique_id:'other'}]}).imageHash);
});
