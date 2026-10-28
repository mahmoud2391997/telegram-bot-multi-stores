export default function handler(req,res) {
  const aiConfigured=Boolean(process.env.GROQ_API_KEY);
  res.status(200).json({ok:true,service:'telegram-multi-store',configured:Boolean(process.env.BOT_TOKEN && process.env.OWNER_ID && process.env.WEBHOOK_SECRET),aiConfigured,aiEnabled:process.env.AI_PARSING_ENABLED==='true' || (process.env.AI_PARSING_ENABLED!=='false' && aiConfigured)});
}
