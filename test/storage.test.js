import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {deflateRawSync} from 'node:zlib';
import {packConfig,unpackConfig} from '../lib/compact-config.js';
import {encodeConfig,decodeConfig,saveSettings} from '../lib/settings.js';
import {fixture,measure} from '../scripts/measure-storage.mjs';
import {channelLimit} from '../lib/limits.js';
process.env.WEBHOOK_SECRET='storage-test-not-a-secret';
test('compact storage shares templates and round trips held fields and escaped keys',()=>{
  const config=fixture(20,10,{reserve:true});config.held[0].parsed.info['!0']='literal';
  const packed=packConfig(config);assert.equal(packed.t.length,1);
  assert.deepEqual(unpackConfig(packed),{...config,wizard:null});
  assert.deepEqual(decodeConfig(encodeConfig(config)),config);
});
test('existing signed v1 pinned settings remain readable',()=>{
  const config=fixture(2,1);const payload=deflateRawSync(Buffer.from(JSON.stringify(config))).toString('base64url');
  const token=payload+'.'+createHmac('sha256',process.env.WEBHOOK_SECRET).update(payload).digest('base64url');
  assert.deepEqual(decodeConfig(token),config);
});
test('oversize settings fail before contacting Telegram',async()=>{
  const original=global.fetch;global.fetch=()=>assert.fail('Must not call Telegram');
  try {await assert.rejects(saveSettings({config:fixture(400,200,{uniqueTemplates:true}),messageId:1}),/حد|تتجاوز/);}finally{global.fetch=original;}
});
test('channel limits are configurable but never bypass message capacity',()=>{
  const original=process.env.MAX_CHANNELS;
  try {process.env.MAX_CHANNELS='60';assert.equal(channelLimit(),60);process.env.MAX_CHANNELS='-1';assert.equal(channelLimit(),100);assert.ok(measure(20,10,{reserve:true})<4000);}finally{if(original===undefined) delete process.env.MAX_CHANNELS;else process.env.MAX_CHANNELS=original;}
});
