import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/webhook.js';
process.env.WEBHOOK_SECRET='local-test-webhook-secret';
function response() { return {code:null,body:null,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},end(){return this;},json(body){this.body=body;return this;}}; }
test('يرفض طرق الطلب غير POST',async()=>{const r=response();await handler({method:'GET'},r);assert.equal(r.code,405);assert.equal(r.headers.Allow,'POST');});
test('يرفض رمز استقبال مفقودًا أو خاطئًا',async()=>{for(const token of [undefined,'wrong','local-test-webhook-secreX']){const r=response();await handler({method:'POST',headers:{'x-telegram-bot-api-secret-token':token},body:{update_id:1}},r);assert.equal(r.code,401);}});
test('يرفض تحديثًا بلا معرّف رقمي صحيح',async()=>{const r=response();await handler({method:'POST',headers:{'x-telegram-bot-api-secret-token':process.env.WEBHOOK_SECRET},body:{update_id:'1'}},r);assert.equal(r.code,400);});
test('يقبل تحديثًا صحيحًا غير ذي صلة دون أي تخزين',async()=>{const r=response();await handler({method:'POST',headers:{'x-telegram-bot-api-secret-token':process.env.WEBHOOK_SECRET},body:{update_id:1}},r);assert.equal(r.code,200);assert.deepEqual(r.body,{ok:true});});
