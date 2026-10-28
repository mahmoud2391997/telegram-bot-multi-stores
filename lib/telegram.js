import {remaining,retryQuick} from './request-budget.js';
export class TelegramError extends Error {
  constructor(method, code, retryAfter) { super(`Telegram ${method} failed (${code})`); this.code = code; this.retryAfter=retryAfter; }
}
export async function telegram(method, data) {
  return retryQuick(async()=>{
  const response = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/${method}`, {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data), signal: AbortSignal.timeout(Math.max(1,Math.min(10000,remaining()))),
  });
  const result = await response.json();
  if (!result.ok) throw new TelegramError(method, result.error_code,result.parameters?.retry_after);
  return result.result;
  },{retryable:e=>e instanceof TelegramError && e.code===429,delay:e=>Number.isFinite(e.retryAfter)?e.retryAfter*1000:Infinity,reserve:12000,maxRetries:2});
}
export const tell = (text, replyMarkup) => telegram('sendMessage', {
  chat_id: process.env.OWNER_ID, text: text.slice(0, 4096),
  ...(replyMarkup ? {reply_markup: replyMarkup} : {}),
});
