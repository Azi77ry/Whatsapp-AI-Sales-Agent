// Hii ndio moyo wa mfumo: inapokea ujumbe wa mteja, inatafuta/inaunda mazungumzo yake,
// inajaribu AI providers kwa mpangilio, inashughulikia tool calls, na kuhifadhi kila kitu kwenye database.
// Imeboreshwa kwa Multi-Tenant SaaS (wafanyabiashara wengi wanajitegemea).

const prisma = require("../db/client");
const config = require("../config");
const { fallbackReply } = require("./fallback");
const { getOrderedProviders } = require("./providers");
const { compactConversation } = require("./compactor");
const { encrypt, decrypt } = require("../utils/crypto");

// Lock ya kuzuia ujumbe mawili kushughulikiwa kwa wakati mmoja kwa mazungumzo yaleyale
// (inazuia race condition kwenye compaction na kuandika historia)
const processingLocks = new Map();

async function withConversationLock(conversationId, fn) {
  const LOCK_TIMEOUT_MS = 15000;
  const start = Date.now();

  // Subiri lock ya sasa ikamilike
  while (processingLocks.get(conversationId)) {
    if (Date.now() - start > LOCK_TIMEOUT_MS) {
      console.warn(`⏱️  Lock timeout kwa mazungumzo #${conversationId} — inaruhusu kupita`);
      break;
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  processingLocks.set(conversationId, true);
  try {
    return await fn();
  } finally {
    processingLocks.delete(conversationId);
  }
}

// Weka alama kwenye conversation kuwa inahitaji mfanyakazi kuiangalia (AI imeshindwa)
// handoverState inafuatana na needsHuman: AI_ACTIVE | HUMAN_REQUESTED | HUMAN_ACTIVE | AI_RESUMED
async function flagNeedsHuman(conversationId, flag, resumed = false) {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      needsHuman: flag,
      handoverState: flag ? "HUMAN_REQUESTED" : resumed ? "AI_RESUMED" : "AI_ACTIVE",
      handoverAt: new Date(),
    },
  });
}

// Pata au tengeneza mazungumzo mapya ya duka hili (merchantId + customerPhone)
async function getOrCreateConversation(customerPhone, customerName, merchantId = 1) {
  const mId = parseInt(merchantId, 10);
  let isNew = false;
  
  let conversation = await prisma.conversation.findUnique({
    where: {
      merchantId_customerPhone: { merchantId: mId, customerPhone },
    },
  });

  if (!conversation) {
    isNew = true;
    conversation = await prisma.conversation.create({
      data: {
        merchantId: mId,
        customerPhone,
        customerName: customerName || null,
        consentGiven: false, // Ujumbe wa kwanza, hajakubali bado
      },
    });
  } else if (customerName && !conversation.customerName) {
    conversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { customerName },
    });
  }

  // Weka isNew kwenye object inayorudi ili tujue kama ni mteja mpya
  return { ...conversation, isNew };
}

async function updateConsent(conversationId, consentGiven, needsHuman) {
  return prisma.conversation.update({
    where: { id: conversationId },
    data: {
      consentGiven,
      needsHuman,
      handoverState: needsHuman ? "HUMAN_REQUESTED" : "AI_ACTIVE",
      handoverAt: needsHuman ? new Date() : undefined,
    },
  });
}

async function saveMessage(conversationId, sender, content, extra = {}) {
  // Ingiza usalama wa hali ya juu: fiche (encrypt) ujumbe kabla ya kuhifadhi kwenye database
  const encryptedContent = encrypt(content);
  const msg = await prisma.message.create({
    data: { conversationId, sender, content: encryptedContent, ...extra },
  });
  
  // UPDATE conversation updatedAt ili mazungumzo yapande juu kwenye dashboard
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() }
  });
  
  return msg;
}

// V2: metadata ya ujumbe wa mteja (wamid ya Meta inazuia kuushughulikia mara mbili)
function inboundExtra(inbound) {
  if (!inbound) return {};
  return {
    direction: "inbound",
    type: inbound.type || "text",
    providerMessageId: inbound.providerMessageId || null,
    phoneNumberId: inbound.phoneNumberId || null,
  };
}

// V2: jibu linaanza "queued"; linakuwa "sent" baada ya Meta kulipokea (retry haiiti AI tena)
function replyExtra(inbound, inboundMessageId) {
  if (!inbound) return {};
  return { direction: "outbound", status: "queued", inReplyToId: inboundMessageId, phoneNumberId: inbound.phoneNumberId || null };
}

// Angalia kama namba hii imewekwa alama ya "Rafiki (Personal)" na admin
async function isPersonalContact(customerPhone, merchantId = 1) {
  const mId = parseInt(merchantId, 10);
  const conversation = await prisma.conversation.findUnique({
    where: {
      merchantId_customerPhone: { merchantId: mId, customerPhone },
    },
    select: { contactType: true },
  });
  return conversation?.contactType === "personal";
}

// Hifadhi ujumbe tu bila kuujibu (kwa marafiki au bot ikiwa imezimwa)
async function logPersonalMessage({ customerPhone, customerName, userMessage, merchantId = 1, inbound = null }) {
  const mId = parseInt(merchantId, 10);
  const conversation = await getOrCreateConversation(customerPhone, customerName, mId);
  await saveMessage(conversation.id, "customer", userMessage, inboundExtra(inbound));
  
  // Fanya compaction (AI Report) ili mfanyabiashara apate muhtasari hata kama bot haijibu
  await maybeCompact(conversation.id, conversation.customerName || customerName);
}

// Pata historia ya hivi karibuni ya mazungumzo
async function getConversationHistory(conversationId) {
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: config.historyLimit,
  });

  // Re-order to chronological (oldest to newest)
  messages.reverse();

  // Decrypt content (inarejesha maandishi halisi kutoka kwenye encryption)
  return messages.map((m) => ({ sender: m.sender, content: decrypt(m.content) }));
}

/**
 * Context Compaction: Fupisha historia ndefu ki-SaaS
 */
async function maybeCompact(conversationId, customerName) {
  const totalCount = await prisma.message.count({ where: { conversationId } });

  // Fanya compaction kila baada ya kufikisha kiwango (mfano: meseji 15, 30, 45, n.k.) ili kuokoa tokens
  if (totalCount < config.compactionThreshold || totalCount % config.compactionThreshold !== 0) return;

  console.log(
    `🗜️  Compaction: Mazungumzo #${conversationId} yana ujumbe ${totalCount}. Inaanza kufupisha...`
  );

  const allMessages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });

  // Decrypt ujumbe kabla ya kumpelekea AI kufanya muhtasari
  const rawHistory = allMessages.map((m) => ({ sender: m.sender, content: decrypt(m.content) }));
  const summary = await compactConversation(rawHistory, customerName);

  if (!summary) {
    console.warn(`⚠️  Compaction: Muhtasari haukupatikana, inaendelea bila kufupisha.`);
    return;
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { contextSummary: summary },
  });

  // MESEJI ZIMEHIFADHIWA - hazifutwe ili mmiliki aweze kuangalia historia yote ya mazungumzo.
  // Compaction inahifadhi muhtasari tu kwa AI context, lakini record kamili ya chats inabaki DB.
  const totalNow = await prisma.message.count({ where: { conversationId } });
  console.log(
    `✅ Compaction imekamilika: Muhtasari umehifadhiwa. Meseji ${totalNow} zimebaki (hazijafutwa).`
  );
}

async function getAiReply(rawHistory, userMessage, context) {
  const providers = getOrderedProviders();
  const configuredProviders = providers.filter((p) => p.isConfigured());

  if (configuredProviders.length === 0) {
    throw new Error("Hakuna AI provider yoyote iliyowekwa sahihi kwenye .env");
  }

  const errors = [];

  for (const provider of configuredProviders) {
    try {
      const text = await provider.getReply(rawHistory, userMessage, context);
      console.log(`✅ Jibu limetoka kwa provider: ${provider.name} (Merchant #${context.merchantId})`);
      return text;
    } catch (err) {
      console.error(`⚠️  Provider "${provider.name}" imeshindwa:`, err.message);
      errors.push(`${provider.name}: ${err.message}`);
    }
  }

  throw new Error(`Providers zote zimeshindwa - ${errors.join(" | ")}`);
}

// Kazi kuu: pokea ujumbe, ishughulikie kwa duka maalum la mfanyabiashara
// Inarudisha { text, inboundMessageId, replyMessageId } - text ni null kama AI iko kimya.
// `inbound` (hiari, V2): { providerMessageId, type, phoneNumberId } kutoka kwa transport.
async function generateReplyDetailed({ customerPhone, customerName, userMessage, merchantId = 1, inbound = null }) {
  const mId = parseInt(merchantId, 10);
  const conversation = await getOrCreateConversation(customerPhone, customerName, mId);

  // Tumia lock kuhakikisha ujumbe mmoja unashughulikiwa kwa wakati mmoja kwa mazungumzo haya
  return withConversationLock(conversation.id, async () => {
    let inboundMessageId = null;
    const saveInbound = async () => {
      const m = await saveMessage(conversation.id, "customer", userMessage, inboundExtra(inbound));
      inboundMessageId = m.id;
    };
    const reply = async (text) => {
      const m = await saveMessage(conversation.id, "ai", text, replyExtra(inbound, inboundMessageId));
      return { text, inboundMessageId, replyMessageId: m.id };
    };

    // Ikiwa mteja alishachagua kuongea na binadamu, AI isijibu (isipokuwa akiomba kurudi kwa AI)
    if (conversation.needsHuman) {
      await saveInbound();
      
      const cleanMsg = userMessage.trim().toLowerCase();
      // Maneno ambayo mteja anaweza kutumia kurudi kwa AI
      const resumeKeywords = ["1", "1️⃣", "ai", "bot", "rudi kwa ai", "rudi kwa bot", "naomba kuongea na bot"];
      
      // Maneno mafupi ("1", "ai", "bot") lazima yalingane kamili - vinginevyo bei kama "15000" ingerudisha AI
      if (resumeKeywords.some(k => cleanMsg === k || (k.length > 3 && cleanMsg.includes(k)))) {
        await flagNeedsHuman(conversation.id, false, true); // needsHuman = false -> AI_RESUMED
        // Tunahakikisha consent iko true pia
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { consentGiven: true },
        });
        const msg = "Sawa, nimerudi! 😊 Karibu tena kwenye mfumo wangu. Nikusaidie nini leo?";
        return reply(msg);
      }
      
      return { text: null, inboundMessageId, replyMessageId: null };
    }

    // Pata mipangilio ya duka hili (merchant settings)
    const merchant = await prisma.merchant.findUnique({
      where: { id: mId },
    });

    // Angalia limit ya AI au Kama Subscription imeisha
    let blockedReason = null;
    if (merchant) {
      if (merchant.aiUsage >= merchant.aiLimit) {
        blockedReason = "Samahani, duka hili limefikisha kikomo chake cha huduma ya AI kwa mwezi huu. Mhudumu (mmiliki) atawasiliana nawe hivi punde.";
      } else if (merchant.subscriptionEndDate && new Date() > merchant.subscriptionEndDate) {
        blockedReason = "Samahani, duka hili halijalipia kifurushi cha huduma ya AI. Mhudumu (mmiliki) atawasiliana nawe hivi punde.";
      }
    }

    if (blockedReason) {
      await saveInbound();
      await flagNeedsHuman(conversation.id, true);
      return reply(blockedReason);
    }

    // Consent Flow Interception
    if (!conversation.consentGiven) {
      await saveInbound();
      const cleanMsg = userMessage.trim();
      
      // Ikiwa wamejibu 1
      if (cleanMsg === "1" || cleanMsg === "1️⃣") {
        await updateConsent(conversation.id, true, false);
        const msg = "Asante kwa kuchagua kuhudumiwa na AI! 😊 Karibu sana, nikusaidie nini leo?";
        return reply(msg);
      }
      
      // Ikiwa wamejibu 2
      if (cleanMsg === "2" || cleanMsg === "2️⃣") {
        await updateConsent(conversation.id, false, true);
        const msg = "Sawa, nimesitisha huduma yangu. Tafadhali subiri kidogo, mmiliki atawasiliana nawe hivi punde.\n\n*(Kama unataka kuendelea na mimi, andika neno 'rudi kwa ai')*";
        return reply(msg);
      }

      // Ikiwa ni ujumbe wa kwanza AU wamejibu kitu kisichoeleweka, watumie Consent Prompt
      const shopName = merchant?.businessName || "Duka Letu";
      const hasCustomWelcome = Boolean(merchant?.welcomeMessage && merchant.welcomeMessage.trim());

      let promptMsg = hasCustomWelcome 
        ? merchant.welcomeMessage
        : `Habari! 👋 Mimi ni Msaidizi wa AI wa *${shopName}*.\n\nUngependa kuhudumiwa na mimi (AI) au ungependa kuongea na mmiliki wa duka?\n\nJibu:\n1️⃣ - Kuendelea na AI\n2️⃣ - Kuongea na Mmiliki`;
      
      // Ongeza picha PEKEE kama welcomeImageEnabled ni true NA welcomeImageUrl ipo
      if (merchant?.welcomeImageEnabled === true && merchant?.welcomeImageUrl && merchant.welcomeImageUrl.trim()) {
        promptMsg = `[IMAGE: ${merchant.welcomeImageUrl.trim()}]\n${promptMsg}`;
      }

      // Kama duka limekusudia Custom Welcome Message, weka consentGiven = true mara moja
      // ili mteja anapouliza swali linalofuata (kama "Utaratibu ukoje"), AI imjibu moja kwa moja badala ya kurudia welcome text!
      if (hasCustomWelcome) {
        await updateConsent(conversation.id, true, false);
      }

      return reply(promptMsg);
    }

    // Kama amesha-consent, endelea kama kawaida
    await saveInbound();

    // Fanya compaction ikiwa imefikia kiwango (Tunaiacha irun background ili isicheleweshe jibu kwa mteja)
    maybeCompact(conversation.id, conversation.customerName || customerName).catch(err => {
      console.error("⚠️ Compaction Error:", err);
    });

    // Tunatumia contextSummary iliyopo kwa sasa
    const updatedConversation = await prisma.conversation.findUnique({
      where: { id: conversation.id },
      select: { contextSummary: true },
    });

    const history = await getConversationHistory(conversation.id);
    const rawHistory = history.slice(0, -1);

    const context = {
      conversationId: conversation.id,
      customerPhone,
      merchantId: mId, // Weka merchantId kwenye context ya tools
      contextSummary: updatedConversation?.contextSummary || null,
      merchant, // Pitisha mipangilio ya duka kwenye AI context
    };

    let finalReplyText = "";
    let usedFallback = false;

    try {
      finalReplyText = await getAiReply(rawHistory, userMessage, context);
      if (!finalReplyText) throw new Error("AI providers zote zimerudisha jibu tupu");

      // Ongeza aiUsage kwa 1 (ikiwa tu ni jibu la AI halisi, siyo fallback)
      await prisma.merchant.update({
        where: { id: mId },
        data: { aiUsage: { increment: 1 } }
      });
    } catch (err) {
      console.error(`⚠️  Merchant #${mId}: AI providers zote zimeshindwa. Inageukia Fallback.`, err.message);
      finalReplyText = await fallbackReply(
        userMessage,
        conversation.id,
        customerPhone,
        conversation.customerName || customerName,
        mId
      );
      usedFallback = true;
    }

    // Tunaondoa `await flagNeedsHuman(conversation.id, usedFallback);` ili bot isizime 
    // moja kwa moja kwa sababu tu ya mtandao kusumbua (temporary API failure).
    // Kama ilishindwa, itajaribu tena kwenye ujumbe unaofuata wa mteja.
    
    return reply(finalReplyText);
  });
}

// API ya zamani (Baileys na code nyingine): inarudisha maandishi ya jibu tu (au null)
async function generateReply(params) {
  const result = await generateReplyDetailed(params);
  return result.text;
}

module.exports = {
  generateReply,
  generateReplyDetailed,
  isPersonalContact,
  logPersonalMessage,
  getOrCreateConversation,
  saveMessage,
  flagNeedsHuman,
};
