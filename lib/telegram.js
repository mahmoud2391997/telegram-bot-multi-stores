export class TelegramError extends Error {
  constructor(method, code) { super(`Telegram ${method} failed (${code})`); this.code = code; }
}
export async function telegram(method, data) {
  const response = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/${method}`, {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data), signal: AbortSignal.timeout(10000),
  });
  const result = await response.json();
  if (!result.ok) throw new TelegramError(method, result.error_code);
  return result.result;
}
export const tell = (text, replyMarkup) => telegram('sendMessage', {
  chat_id: process.env.OWNER_ID, text: text.slice(0, 4096),
  ...(replyMarkup ? {reply_markup: replyMarkup} : {}),
});
