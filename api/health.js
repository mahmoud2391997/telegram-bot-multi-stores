export default function handler(req,res) {
  res.status(200).json({ok:true,service:'telegram-multi-store',configured:Boolean(process.env.BOT_TOKEN && process.env.OWNER_ID && process.env.WEBHOOK_SECRET)});
}
