import {randomBytes} from 'node:crypto';
import {channelCandidates} from '../data/channel-candidates.js';
import {telegram, tell} from './telegram.js';
import {loadSettings, saveSettings, emptyConfig, UserError} from './settings.js';
import {parseCommission, validFormat, renderPost, defaultFormat, clothingFormat} from './parser.js';
import {analyzeMessage} from './analyze-message.js';
import {aiEnabled, textModel, visionModel, AnalysisError} from './ai-parser.js';
import {claimPost,compactMessage} from './post-log.js';
import {remaining} from './request-budget.js';

const menu = {keyboard:[['إضافة قناة','القنوات'],['تعديل قناة','حذف قناة'],['إضافة قسم','الأقسام'],['قنوات ملابس مقترحة','تجربة التحليل'],['إعدادات التحليل','المساعدة'],['حالة النشر','المنشورات الفاشلة'],['إلغاء']],resize_keyboard:true};
const keyboard = rows => ({keyboard:[...rows.map(row => Array.isArray(row) ? row : [row]),['إلغاء']],resize_keyboard:true,one_time_keyboard:true});
const roleName = role => role === 'source' ? 'مصدر للاستقبال' : 'وجهة للنشر';
const commissionName = c => c.type === 'percent' ? `${c.amount}٪` : `${c.amount} مبلغ ثابت`;
const help = `أهلًا بك في مدير القنوات 👋

• إضافة قسم: اختر الاسم والعملة.
• إضافة قناة: اختر مصدرًا لاستقبال المنشورات أو وجهةً لنشرها، ثم اختر القسم والقناة.
• قناة النشر: حدد العمولة وصيغة المنشور النهائي، ثم راجع المثال واحفظ.
• تعديل قناة: غيّر العمولة وصيغة النشر.
• حذف قناة: أوقف استقبال المنشورات منها أو النشر فيها.
• قنوات ملابس مقترحة: تصفّح مصادر عامة وجدناها، ثم أضف ما يناسبك.
• تجربة التحليل: أرسل نصًا أو صورة لاستخراج معلومات المنتج ومعاينة القالب دون نشر.
• إعدادات التحليل: اعرض حالة Groq والنماذج المستخدمة.

يُنشر كل منشور جديد تلقائيًا إلى وجهات القسم نفسه عند التعرف على سعر المورد.
العمولة تُضاف إلى السعر: 10% نسبة مئوية، أو 50 مبلغ ثابت.

أضف البوت إلى قنوات المصدر، وامنحه صلاحية النشر في الوجهات. للمجموعات: اجعله مشرفًا أو عطّل وضع الخصوصية.
لا تحذف رسالة الإعدادات المثبتة ولا تثبت رسالة أحدث منها.
يدعم Groq تحليل النص والصور عند ضبط المفتاح. لا يتم تحليل محتوى الفيديو. الألبومات تُعالج منفصلة. الأسعار غير الواضحة تتوقف للمراجعة.`;

async function changeWizard(state, wizard, prompt, markup) {
  state.config.wizard = wizard ? {...wizard, expires:Date.now()+30*60*1000} : null;
  await saveSettings(state);
  return tell(prompt, markup || menu);
}
async function chooseDepartment(state, wizard) {
  if (!state.config.departments.length) return changeWizard(state,null,'أنشئ قسمًا أولًا من زر «إضافة قسم».');
  return changeWizard(state,{...wizard,step:'department'},'اختر القسم:',keyboard(state.config.departments.map(d=>d.name)));
}
async function chooseChat(state, wizard) {
  const requestId = randomBytes(4).readInt32BE();
  return changeWizard(state,{...wizard,step:'chat',requestId},'اختر القناة أو المجموعة من الأزرار، أو أرسل @اسم_القناة أو معرّفها الرقمي. يمكنك أيضًا تحويل منشور من القناة إذا كان المصدر ظاهرًا.\nأضف البوت للقناة أولًا.', {
    keyboard:[[{text:'اختيار قناة',request_chat:{request_id:requestId,chat_is_channel:true,bot_is_member:true,request_title:true}}],
      [{text:'اختيار مجموعة',request_chat:{request_id:requestId,chat_is_channel:false,bot_is_member:true,request_title:true}}],['إلغاء']],resize_keyboard:true,one_time_keyboard:true,
  });
}
async function validateChat(chatId, role) {
  let chat, member;
  try {
    chat = await telegram('getChat',{chat_id:chatId});
    const me = await telegram('getMe',{});
    member = await telegram('getChatMember',{chat_id:chat.id,user_id:me.id});
  } catch { throw new UserError('لم أتمكن من الوصول للقناة. تحقق من المعرّف وأضف البوت إليها، ثم حاول مجددًا.'); }
  if (!['channel','group','supergroup'].includes(chat.type)) throw new UserError('اختر قناة أو مجموعة، وليس محادثة شخصية.');
  if (!['member','administrator','creator'].includes(member.status)) throw new UserError('أضف البوت للقناة أو المجموعة واسمح له بإرسال الرسائل.');
  if (role === 'destination' && chat.type === 'channel' && member.status !== 'creator' && !member.can_post_messages) throw new UserError('امنح البوت صلاحية نشر الرسائل في القناة ثم حاول مجددًا.');
  if (role === 'destination' && chat.type !== 'channel' && member.status === 'member' && chat.permissions?.can_send_messages === false) throw new UserError('المجموعة لا تسمح للبوت بإرسال الرسائل. امنحه الصلاحيات أولًا.');
  return chat;
}
async function confirmChannel(state,wizard) {
  const d = state.config.departments.find(d=>d.id===wizard.channel.department);
  const c = wizard.channel;
  const details = c.role === 'destination' ? `\nالعمولة: ${commissionName(c.commission)}\n\nمثال بسعر مورد 100 ${d.currency}:\n${renderPost({body:'هاتف تجريبي\nاللون: أسود\nالسعة: 128 GB',supplierPrice:'100',info:{'اسم_المنتج':'هاتف تجريبي','اللون':'أسود','السعة':'128 GB'}},c,d)}` : '';
  return changeWizard(state,{...wizard,step:'confirm'},`راجع الإعدادات:\n${c.title}\nالنوع: ${roleName(c.role)}\nالقسم: ${d.name}${details}\n\nهل تريد حفظ القناة؟`,keyboard(['حفظ القناة']));
}
async function processWizard(state,message) {
  const w = state.config.wizard;
  if (!w) return tell('اختر إجراءً من الأزرار أدناه.',menu);
  if (w.expires < Date.now()) return changeWizard(state,null,'انتهت مهلة الخطوة. ابدأ مجددًا من القائمة.');
  const text = (message.text || '').trim();
  if (w.step === 'test_destination') {
    const channel = state.config.channels.find(c=>c.role==='destination' && `${c.title} (${c.id})`===text);
    if (!channel) return tell('اختر قناة نشر من الأزرار.');
    return changeWizard(state,{step:'test_post',channelId:channel.id},'أرسل نص منشور مورد أو صورة مع وصف. سأعرض نتيجة التحليل وصيغة النشر دون إرسالها لأي قناة.');
  }
  if (w.step === 'test_post') {
    const channel = w.channelId ? state.config.channels.find(c=>c.id===w.channelId) : {title:'قالب الملابس التجريبي',format:clothingFormat,commission:{type:'fixed',amount:0}};
    if (!channel) return changeWizard(state,null,'القناة لم تعد موجودة. اختر قناة أخرى للتجربة.');
    const department = w.channelId ? state.config.departments.find(d=>d.id===channel.department) : {name:'ملابس',currency:'جنيه'};
    if(message.has_protected_content) return tell('لا يمكن تحليل محتوى محمي من النسخ.');
    const parsed = await analyzeMessage(message,{currency:department.currency});
    if (!parsed.supplierPrice) return tell(`لم يُنشر شيء؛ المنشور يحتاج مراجعة.\n${parsed.reviewReason || 'لم أجد سعرًا واحدًا واضحًا. جرّب منشورًا بسطر مثل «السعر: 150 جنيه».'}`);
    const output = renderPost(parsed,channel,department);
    const info = Object.entries(parsed.info).filter(([,value])=>value).map(([key,value])=>`${key.replaceAll('_',' ')}: ${value}`).join('\n');
    await changeWizard(state,null,`نتيجة التحليل — معاينة فقط\nالمحلل: ${parsed.engine==='groq'?'Groq للنص والصورة':'القواعد البرمجية'}\nسعر المورد: ${parsed.supplierPrice} ${department.currency}\n${info}`);
    return tell(`صيغة النشر إلى «${channel.title}»:\n\n${output}`);
  }
  if (w.step === 'department_name') {
    if (!text || text.length>32 || menu.keyboard.flat().includes(text) || text.includes('\n') || state.config.departments.some(d=>d.name===text)) return tell('أرسل اسم قسم فريدًا لا يتجاوز 32 حرفًا.');
    return changeWizard(state,{step:'currency',name:text},'اختر عملة القسم:',keyboard(['جنيه مصري','دولار أمريكي','ريال سعودي','درهم إماراتي']));
  }
  if (w.step === 'currency') {
    const currencies = {'جنيه مصري':'جنيه','دولار أمريكي':'دولار','ريال سعودي':'ريال','درهم إماراتي':'درهم'};
    if (!currencies[text]) return tell('اختر العملة من الأزرار.');
    state.config.departments.push({id:randomBytes(3).toString('hex'),name:w.name,currency:currencies[text]});
    return changeWizard(state,null,`تم إنشاء قسم «${w.name}». يمكنك الآن إضافة قنواته.`);
  }
  if (w.step === 'role') {
    const roleText=text.replace(/[«»"']/g,'').trim();
    const role = ['مصدر (استقبال)','مصدر','استقبال'].includes(roleText) ? 'source' : ['وجهة (نشر)','وجهة','نشر'].includes(roleText) ? 'destination' : null;
    if (!role) return tell('اختر «مصدر (استقبال)» أو «وجهة (نشر)».');
    return chooseDepartment(state,{channel:{role}});
  }
  if (w.step === 'department') {
    const d = state.config.departments.find(d=>d.name===text);
    if (!d) return tell('اختر قسمًا من الأزرار.');
    return chooseChat(state,{...w,channel:{...w.channel,department:d.id}});
  }
  if (w.step === 'chat') {
    let id = message.chat_shared?.request_id === w.requestId ? message.chat_shared.chat_id : null;
    if (!id && message.forward_origin?.type === 'channel') id = message.forward_origin.chat.id;
    if (!id && (/^@[A-Za-z0-9_]{5,32}$/.test(text) || /^-\d+$/.test(text))) id = text;
    if (!id) return tell('اختر القناة من الأزرار، أو أرسل اسمها بصيغة @username أو معرّفها الرقمي.');
    const chat = await validateChat(id,w.channel.role);
    if (state.config.channels.some(c=>c.id===String(chat.id))) return tell('هذه القناة مسجلة بالفعل. استخدم «تعديل قناة» أو احذفها أولًا لتغيير قسمها أو نوعها.');
    if(w.channel.role==='destination' && state.config.channels.filter(c=>c.role==='destination' && c.department===w.channel.department).length>=3) return tell('الحد الحالي ثلاث وجهات نشر لكل قسم لتقليل مدة معالجة المنشور.');
    const channel = {...w.channel,id:String(chat.id),title:(chat.title || String(chat.id)).slice(0,50)};
    if (channel.role === 'source') return confirmChannel(state,{channel});
    return changeWizard(state,{step:'commission',channel},'ما العمولة التي تريد إضافتها لسعر المورد؟\nأرسل 10% لإضافة نسبة 10٪، أو 50 لإضافة مبلغ ثابت قدره 50 بعملة القسم.\nأرسل 0 للنشر بسعر المورد.');
  }
  if (w.step === 'commission') {
    const commission = parseCommission(text);
    if (!commission) return tell('أرسل نسبة مثل 10% أو مبلغًا ثابتًا مثل 50. استخدم رقمًا موجبًا أو صفرًا.');
    return changeWizard(state,{...w,step:'format',channel:{...w.channel,commission}},`أرسل صيغة المنشور النهائي، أو اختر «الصيغة الافتراضية».\n\nالحقول المتاحة:\n{المحتوى} — وصف المورد دون سطر السعر\n{السعر} — السعر بعد إضافة العمولة (مطلوب)\n{العملة}، {القسم}، {سعر_المورد}، {العمولة}\n{اسم_المنتج}، {الموديل}، {اللون}، {المقاس}، {السعة}، {الحالة}، {الكود}، {الخامة}\nالحقول غير الموجودة في منشور المورد ستظهر فارغة.\n\nمثال:\n${defaultFormat}\n\nيمكن استخدام {وحدة_السعر} لعرض سعر القطعة أو الطقم أو الدستة.\nالحد الأقصى للصيغة 600 حرف.`,keyboard(['قالب ملابس جاهز','الصيغة الافتراضية']));
  }
  if (w.step === 'format') {
    const format = text === 'قالب ملابس جاهز' ? clothingFormat : text === 'الصيغة الافتراضية' ? defaultFormat : text;
    if (!validFormat(format)) return tell('الصيغة يجب أن تحتوي على {السعر} وألا تتجاوز 600 حرف. استخدم أسماء الحقول الموضحة فقط.');
    return confirmChannel(state,{...w,channel:{...w.channel,format}});
  }
  if (w.step === 'confirm') {
    if (text !== 'حفظ القناة') return tell('اضغط «حفظ القناة» أو «إلغاء».');
    // Revalidate access at confirmation; permission changes must not silently register a channel.
    await validateChat(w.channel.id,w.channel.role);
    state.config.channels = state.config.channels.filter(c=>c.id!==w.channel.id);
    state.config.channels.push(w.channel);
    return changeWizard(state,null,`تم حفظ قناة «${w.channel.title}». ستُطبّق الإعدادات على المنشورات الجديدة فورًا.`);
  }
  if (w.step === 'select_remove' || w.step === 'select_edit') {
    const channel = state.config.channels.find(c=>`${c.title} (${c.id})`===text);
    if (!channel) return tell('اختر القناة من الأزرار.');
    if(w.step === 'select_remove') return changeWizard(state,{step:'confirm_remove',channel},`هل تريد حذف «${channel.title}» من البوت؟ لن تُحذف القناة نفسها من تيليجرام.`,keyboard(['تأكيد حذف القناة']));
    if(channel.role !== 'destination') return tell('قنوات المصدر لا تحتاج عمولة أو صيغة نشر. لتغيير القسم احذف المصدر وأضفه مجددًا.');
    return changeWizard(state,{step:'commission',channel:{...channel}},`العمولة الحالية: ${commissionName(channel.commission)}\nأرسل العمولة الجديدة، مثل 10% أو 50.`);
  }
  if (w.step === 'confirm_remove') {
    if(text !== 'تأكيد حذف القناة') return tell('اضغط «تأكيد حذف القناة» أو «إلغاء».');
    state.config.channels = state.config.channels.filter(c=>c.id!==w.channel.id);
    return changeWizard(state,null,'تم حذف القناة من إعدادات البوت.');
  }
  return changeWizard(state,null,'ابدأ مجددًا من القائمة.');
}
async function ownerMessage(message,updateId) {
  const text = (message.text || '').trim();
  let state;
  if (text === '/initialize') {
    state = {config:emptyConfig(),messageId:null};
    await saveSettings(state);
    return tell('تم إنشاء إعدادات فارغة وتثبيتها. ابدأ بإضافة قسم. احتفظ برسالة الإعدادات مثبتة.',menu);
  }
  state = await loadSettings();
  if (!state) {
    if (text !== '/start') return tell('أرسل /start لبدء إعداد البوت.');
    state = {config:emptyConfig(),messageId:null};
    await saveSettings(state);
  }
  if(Number.isSafeInteger(updateId)) {
    state.config.updates ||= [];
    if(state.config.updates.includes(updateId)) return;
    state.config.updates=state.config.updates.concat(updateId).slice(-24);
    await saveSettings(state);
  }
  if (['/start','/help','المساعدة'].includes(text)) return tell(help,menu);
  if (['إلغاء','/cancel'].includes(text)) return changeWizard(state,null,'تم إلغاء الخطوة. اختر الإجراء المطلوب.');
  if (text === 'قنوات ملابس مقترحة') return tell('قنوات ملابس عامة — اقتراحات للاطلاع، وليست مصادر مفعلة أو توصية بالشراء:\n\n' + channelCandidates.map(c=>`${c.name}\n${c.category} — ${c.location}\n${c.url}`).join('\n\n') + '\n\nللتفعيل: أضف البوت إلى المصدر، ثم اضغط «إضافة قناة». الوصول للصفحة العامة وحده لا يتيح للبوت استقبال منشورات القناة.',menu);
  if (text === 'تجربة التحليل') {
    const destinations = state.config.channels.filter(c=>c.role==='destination');
    if (!destinations.length) return changeWizard(state,{step:'test_post',channelId:null},'أرسل نصًا أو صورة منتج. سأحللها وأعرض قالب ملابس تجريبيًا دون عمولة أو نشر لأي قناة.');
    return changeWizard(state,{step:'test_destination'},'اختر الوجهة لتجربة العمولة وصيغة النشر:',keyboard(destinations.map(c=>`${c.title} (${c.id})`)));
  }
  if(text === 'إعدادات التحليل') return tell(`حالة تحليل المنشورات\nالمحلل: ${aiEnabled()?'Groq API':'قواعد برمجية'}\nمفتاح Groq: ${process.env.GROQ_API_KEY?'مضبوط في السيرفر':'غير مضبوط'}\nنموذج النص: ${textModel()}\nنموذج الصورة: ${visionModel()}\nيُختبر الاتصال عبر «تجربة التحليل». لا ترسل مفاتيح API هنا.`,menu);
  if (text === 'إضافة قسم') {
    if(state.config.departments.length>=10) return tell('الحد الحالي عشرة أقسام.');
    return changeWizard(state,{step:'department_name'},'ما اسم القسم؟ مثال: هواتف، ملابس، أجهزة منزلية.');
  }
  if (text === 'إضافة قناة') {
    if(state.config.channels.length>=20) return tell('الحد الحالي عشرون قناة. احذف قناة غير مستخدمة أولًا.');
    return changeWizard(state,{step:'role'},'ما نوع القناة التي تريد إضافتها؟',keyboard([['مصدر (استقبال)','وجهة (نشر)']]));
  }
  if (text === 'حذف قناة' || text === 'تعديل قناة') {
    const channels = state.config.channels.filter(c=>text === 'حذف قناة' || c.role === 'destination');
    if(!channels.length) return tell('لا توجد قنوات مناسبة لهذا الإجراء.',menu);
    return changeWizard(state,{step:text === 'حذف قناة' ? 'select_remove' : 'select_edit'},'اختر القناة:',keyboard(channels.map(c=>`${c.title} (${c.id})`)));
  }
  if (text === 'القنوات') return tell(state.config.channels.map(c=>`${c.title} (${c.id})\n${roleName(c.role)} — ${state.config.departments.find(d=>d.id===c.department)?.name}${c.role==='destination' ? ` — العمولة: ${commissionName(c.commission)}` : ''}`).join('\n\n') || 'لم تُضف قنوات بعد.',menu);
  if (text === 'الأقسام') return tell(state.config.departments.map(d=>`${d.name} — ${d.currency}`).join('\n') || 'لم تُضف أقسام بعد.',menu);
  if(text==='المنشورات الفاشلة') {
    const failed=(state.config.posts || []).filter(p=>p.status==='failed'&&p.data);
    if(!failed.length) return tell('لا توجد منشورات فاشلة قابلة لإعادة المحاولة.',menu);
    for(const entry of failed) await tell(`فشل المنشور ${entry.message} من ${entry.source}`,retryButton(entry));
    return;
  }
  if (text === 'حالة النشر') return tell(state.config.receipts.slice(-8).map(r=>`المصدر: ${r.source}\nالمنشور: ${r.message}\nالوجهة: ${r.target}\nالحالة: ${r.status==='sent'?'تم النشر':r.status==='failed'?'فشل النشر':'إرسال غير مؤكد؛ افحص الوجهة قبل إعادة الإرسال'}`).join('\n\n') || 'لا توجد محاولات نشر حديثة.',menu);
  return processWizard(state,message);
}
async function notify(text) { try { await tell(text); } catch { console.error('تعذر إرسال تنبيه للمالك'); } }
const retryButton=entry=>({inline_keyboard:[[{text:'إعادة المحاولة',callback_data:`retry:${entry.source}:${entry.message}`}]]});
async function failPost(state,entry,message,reason) {
  entry.status='failed';entry.data=compactMessage(message);
  try {await saveSettings(state);}
  catch(error) {delete entry.data;await saveSettings(state);return notify('فشل المنشور وتعذر حفظ بيانات إعادة المحاولة بسبب سعة الإعدادات. أعد إرسال الأصل يدويًا بعد فحص الوجهة.');}
  await tell(`فشل المنشور ${entry.message}. ${reason}`,retryButton(entry));
}
async function ownerCallback(query,updateId) {
  if(String(query.from?.id)!==process.env.OWNER_ID || String(query.message?.chat.id)!==process.env.OWNER_ID) return;
  const state=await loadSettings();if(!state) return;
  state.config.updates ||= [];
  if(Number.isSafeInteger(updateId)&&state.config.updates.includes(updateId)) return;
  if(Number.isSafeInteger(updateId)) state.config.updates=state.config.updates.concat(updateId).slice(-24);
  await telegram('answerCallbackQuery',{callback_query_id:query.id});
  const match=query.data?.match(/^retry:(-?\d+):(\d+)$/);
  const entry=match&&(state.config.posts || []).find(p=>p.source===match[1]&&p.message===Number(match[2]));
  if(!entry || entry.status!=='failed' || !entry.data) {await saveSettings(state);return tell('هذا الإجراء انتهى أو الإرسال غير مؤكد؛ افحص الوجهة أولًا.');}
  const message=entry.data;
  entry.status='processing';delete entry.data;
  state.config.receipts=state.config.receipts.filter(r=>!(r.source===entry.source&&r.message===entry.message&&r.status==='failed'));
  await saveSettings(state);
  return handleSource(message,undefined,{retry:true});
}
export async function handleSource(message,updateId,{retry=false}={}) {
  const state = await loadSettings();
  if(!state) return;
  const source = state.config.channels.find(c=>c.id===String(message.chat.id) && c.role==='source');
  if(!source || (!message.text && !message.caption && !message.photo && !message.video)) return;
  if(message.has_protected_content) return notify('تجاوزت منشورًا محميًا من النسخ.');
  const department = state.config.departments.find(d=>d.id===source.department);
  const destinations = state.config.channels.filter(c=>c.role==='destination' && c.department===source.department);
  if(!destinations.length) return notify(`أضف قناة نشر لقسم «${department.name}» لاستقبال منشوراته.`);
  if(destinations.every(target=>state.config.receipts.some(r=>r.source===source.id && r.message===message.message_id && r.target===target.id))) return;
  if(message.document || message.audio || (!message.text && !message.photo && !message.video)) return notify('نوع المنشور غير مدعوم. المدعوم: نص وصور وفيديو مع وصف.');
  const entry=retry?state.config.posts?.find(p=>p.source===source.id&&p.message===message.message_id):claimPost(state.config,message,updateId);
  if(!entry) return;
  // Persist before external work. This is best effort, not an atomic lock.
  await saveSettings(state);
  let parsed;
  try {parsed=await analyzeMessage(message,{currency:department.currency});}
  catch(error) {return failPost(state,entry,message,error instanceof AnalysisError?error.message:'تعذر تحليل المنشور.');}
  if(!parsed.supplierPrice) return notify(`لم يُنشر المنشور ${message.message_id} من «${source.title}» لعدم وجود سعر مورد واضح أو بسبب معلومات تحتاج مراجعة. ${parsed.reviewReason || 'استخدم سطرًا مثل «السعر: 1500 جنيه».'}`);
  for(const target of destinations) {
    if(state.config.receipts.some(r=>r.source===source.id && r.message===message.message_id && r.target===target.id)) continue;
    const content = renderPost(parsed,target,department);
    const media = message.photo ? {type:'photo',file_id:message.photo.at(-1).file_id} : message.video ? {type:'video',file_id:message.video.file_id} : null;
    if ((!media && !message.text) || message.document || message.audio) { await notify(`نوع المنشور ${message.message_id} غير مدعوم. المدعوم: نص وصور وفيديو.`); continue; }
    if(content.length > (media ? 1024 : 4096)) { await notify(`تعذر نشر المنشور ${message.message_id} إلى «${target.title}»: النص أطول من الحد المسموح. اختصر صيغة النشر.`); continue; }
    const receipt = {source:source.id,message:message.message_id,target:target.id,status:'uncertain'};
    state.config.receipts.push(receipt);
    state.config.receipts = state.config.receipts.slice(-24);
    // Record the attempt before sending. Retries skip uncertain attempts to avoid duplicates.
    await saveSettings(state);
    try {
      if(remaining()<15000) {const error=new Error('Insufficient request budget');error.code=408;throw error;}
      await telegram(media ? (media.type==='photo'?'sendPhoto':'sendVideo') : 'sendMessage',media ? {chat_id:target.id,[media.type]:media.file_id,caption:content} : {chat_id:target.id,text:content});
    } catch(error) {
      receipt.status = error.code && error.code < 500 ? 'failed' : 'uncertain';
      await saveSettings(state);
      if(receipt.status==='failed') {await failPost(state,entry,message,'تعذر الإرسال ضمن مهلة الطلب.');return;}
      entry.status='uncertain';await saveSettings(state);
      await notify(`تعذر تأكيد نشر المنشور ${message.message_id} في «${target.title}». افحص القناة قبل إعادة الإرسال يدويًا. لن أكرر المحاولة تلقائيًا.`);
      continue;
    }
    receipt.status='sent';
    await saveSettings(state);
  }
  if(entry.status!=='uncertain') entry.status='sent';
  await saveSettings(state);
}
export async function handleUpdate(update) {
  if(update.callback_query) return ownerCallback(update.callback_query,update.update_id);
  const message = update.message || update.channel_post;
  if(!message) return;
  if(message.chat.type==='private') {
    if(String(message.from?.id)!==process.env.OWNER_ID || String(message.chat.id)!==process.env.OWNER_ID) return;
    try { await ownerMessage(message,update.update_id); }
    catch(error) { if(error instanceof UserError || error instanceof AnalysisError) return tell(error.message,menu); throw error; }
    return;
  }
  try { return await handleSource(message,update.update_id); }
  catch(error) { if(error instanceof UserError || error instanceof AnalysisError) return notify(error.message); throw error; }
}
