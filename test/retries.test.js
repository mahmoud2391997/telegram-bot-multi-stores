import test from 'node:test';
import assert from 'node:assert/strict';
import {retryQuick,withBudget} from '../lib/request-budget.js';
import {telegram} from '../lib/telegram.js';
test('quick retries stop at count and budget bounds',async()=>{
  let calls=0;const delays=[];
  await assert.rejects(retryQuick(async()=>{calls++;throw Error('temporary');},{retryable:()=>true,delay:()=>200,wait:async n=>delays.push(n),left:()=>20000}));
  assert.equal(calls,3);assert.deepEqual(delays,[200,200]);
  calls=0;
  await assert.rejects(retryQuick(async()=>{calls++;throw Error();},{retryable:()=>true,delay:()=>200,wait:()=>assert.fail(),left:()=>100}));
  assert.equal(calls,1);
});
test('Telegram retries explicit 429 but never an uncertain network send',async()=>{
  const original=global.fetch;let calls=0;
  try {
    global.fetch=async()=>({json:async()=>++calls===1?{ok:false,error_code:429,parameters:{retry_after:0}}:{ok:true,result:true}});
    assert.equal(await telegram('sendMessage',{}),true);assert.equal(calls,2);
    calls=0;global.fetch=async()=>{calls++;throw Error('network failure');};
    await assert.rejects(telegram('sendMessage',{}));assert.equal(calls,1);
    calls=0;global.fetch=async()=>{calls++;return {json:async()=>({ok:false,error_code:429,parameters:{retry_after:60}})};};
    await assert.rejects(withBudget(()=>telegram('sendPhoto',{}),20000));assert.equal(calls,1);
  } finally {global.fetch=original;}
});
