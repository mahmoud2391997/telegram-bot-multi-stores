import {createHmac, timingSafeEqual} from 'node:crypto';
import {deflateRawSync, inflateRawSync} from 'node:zlib';
import {telegram} from './telegram.js';
export class UserError extends Error {}
export const emptyConfig = () => ({v:1, departments:[], channels:[], wizard:null, receipts:[]});
const marker = 'إعدادات_البوت:';
export function encodeConfig(config) {
  const payload = deflateRawSync(Buffer.from(JSON.stringify(config))).toString('base64url');
  const signature = createHmac('sha256', process.env.WEBHOOK_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}
export function decodeConfig(token) {
  try {
    const [payload, signature, extra] = token.split('.');
    if (extra || !signature) return null;
    const expected = createHmac('sha256', process.env.WEBHOOK_SECRET).update(payload).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const config = JSON.parse(inflateRawSync(Buffer.from(payload,'base64url'), {maxOutputLength:65536}).toString());
    return config.v === 1 && Array.isArray(config.channels) && Array.isArray(config.departments) && Array.isArray(config.receipts) ? config : null;
  } catch { return null; }
}
export async function loadSettings() {
  const chat = await telegram('getChat', {chat_id:process.env.OWNER_ID});
  const pinned = chat.pinned_message;
  if (!pinned) return null;
  const text = pinned.text || '';
  const index = text.indexOf(marker);
  const config = index >= 0 ? decodeConfig(text.slice(index + marker.length).trim()) : null;
  if (!config) throw new UserError('لم أتمكن من قراءة الإعدادات. أعد تثبيت رسالة إعدادات البوت الأصلية. لبدء إعدادات فارغة أرسل /initialize.');
  return {config, messageId:pinned.message_id};
}
export async function saveSettings(state) {
  const token = encodeConfig(state.config);
  const text = `⚙️ إعدادات مدير القنوات\nاحتفظ بهذه الرسالة مثبتة ولا تحذفها. تحفظ إعداداتك دون قاعدة بيانات خارجية. استخدم أزرار المحادثة لتعديل الإعدادات.\n\n${marker}${token}`;
  if (text.length > 4000) throw new UserError('وصلت الإعدادات إلى الحد المتاح في رسالة تيليجرام. اختصر أسماء القنوات أو صيغة النشر، أو احذف قناة غير مستخدمة.');
  if (state.messageId) {
    try { await telegram('editMessageText',{chat_id:process.env.OWNER_ID, message_id:state.messageId, text}); }
    catch (error) { if (error.code !== 400) throw error; /* Recheck: identical updates return 400 too. */
      const current = await loadSettings();
      if (!current || encodeConfig(current.config) !== token) throw error;
    }
  } else {
    const message = await telegram('sendMessage',{chat_id:process.env.OWNER_ID,text});
    state.messageId = message.message_id;
    await telegram('pinChatMessage',{chat_id:process.env.OWNER_ID,message_id:state.messageId,disable_notification:true});
  }
}
