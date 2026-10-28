import {timingSafeEqual} from 'node:crypto';
import {handleUpdate} from '../lib/bot.js';
export default async function handler(req,res) {
  if(req.method!=='POST') {res.setHeader('Allow','POST');return res.status(405).end();}
  const expected=process.env.WEBHOOK_SECRET;
  const supplied=req.headers['x-telegram-bot-api-secret-token'];
  if(!expected || typeof supplied!=='string' || Buffer.byteLength(supplied)!==Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied),Buffer.from(expected))) return res.status(401).end();
  if(!Number.isSafeInteger(req.body?.update_id)) return res.status(400).end();
  try {
    await handleUpdate(req.body);
    return res.status(200).json({ok:true});
  } catch {
    console.error('تعذرت معالجة تحديث تيليجرام',{update_id:req.body.update_id});
    return res.status(503).json({ok:false});
  }
}
