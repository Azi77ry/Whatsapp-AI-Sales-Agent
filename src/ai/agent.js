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
async function flagNeedsHuman(conversationId, flag) {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { needsHuman: flag },
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
    data: { consentGiven, needsHuman },
  });
}

async function saveMessage(conversationId, sender, content) {
  // Ingiza usalama wa hali ya juu: fiche (encrypt) ujumbe kabla ya kuhifadhi kwenye database
  const encryptedContent = encrypt(content);
  const msg = await prisma.message.create({
    data: { conversationId, sender, content: encryptedContent },
  });
  
  // UPDATE conversation updatedAt ili mazungumzo yapande juu kwenye dashboard
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() }
  });
  
  return msg;
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
async function logPersonalMessage({ customerPhone, customerName, userMessage, merchantId = 1 }) {
  const mId = parseInt(merchantId, 10);
  const conversation = await getOrCreateConversation(customerPhone, customerName, mId);
  await saveMessage(conversation.id, "customer", userMessage);
  
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
async function generateReply({ customerPhone, customerName, userMessage, merchantId = 1 }) {
  const mId = parseInt(merchantId, 10);
  const conversation = await getOrCreateConversation(customerPhone, customerName, mId);

  // Tumia lock kuhakikisha ujumbe mmoja unashughulikiwa kwa wakati mmoja kwa mazungumzo haya
  return withConversationLock(conversation.id, async () => {
    // Ikiwa mteja alishachagua kuongea na binadamu, AI isijibu (isipokuwa akiomba kurudi kwa AI)
    if (conversation.needsHuman) {
      await saveMessage(conversation.id, "customer", userMessage);
      
      const cleanMsg = userMessage.trim().toLowerCase();
      // Maneno ambayo mteja anaweza kutumia kurudi kwa AI
      const resumeKeywords = ["1", "1️⃣", "ai", "bot", "rudi kwa ai", "rudi kwa bot", "naomba kuongea na bot"];
      
      if (resumeKeywords.some(k => cleanMsg === k || cleanMsg.includes(k))) {
        await flagNeedsHuman(conversation.id, false); // needsHuman = false
        // Tunahakikisha consent iko true pia
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { consentGiven: true },
        });
        const msg = "Sawa, nimerudi! 😊 Karibu tena kwenye mfumo wangu. Nikusaidie nini leo?";
        await saveMessage(conversation.id, "ai", msg);
        return msg;
      }
      
      return null;
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
      await saveMessage(conversation.id, "customer", userMessage);
      await flagNeedsHuman(conversation.id, true);
      await saveMessage(conversation.id, "ai", blockedReason);
      return blockedReason;
    }

    // Consent Flow Interception
    if (!conversation.consentGiven) {
      await saveMessage(conversation.id, "customer", userMessage);
      const cleanMsg = userMessage.trim();
      
      // Ikiwa wamejibu 1
      if (cleanMsg === "1" || cleanMsg === "1️⃣") {
        await updateConsent(conversation.id, true, false);
        const msg = "Asante kwa kuchagua kuhudumiwa na AI! 😊 Karibu sana, nikusaidie nini leo?";
        await saveMessage(conversation.id, "ai", msg);
        return msg;
      }
      
      // Ikiwa wamejibu 2
      if (cleanMsg === "2" || cleanMsg === "2️⃣") {
        await updateConsent(conversation.id, false, true);
        const msg = "Sawa, nimesitisha huduma yangu. Tafadhali subiri kidogo, mmiliki atawasiliana nawe hivi punde.\n\n*(Kama unataka kuendelea na mimi, andika neno 'rudi kwa ai')*";
        await saveMessage(conversation.id, "ai", msg);
        return msg;
      }

      // Ikiwa ni ujumbe wa kwanza AU wamejibu kitu kisichoeleweka, watumie Consent Prompt
      const shopName = merchant?.businessName || "Duka Letu";
      const promptMsg = `Habari! 👋 Mimi ni Msaidizi wa AI wa *${shopName}*.\n\nUngependa kuhudumiwa na mimi (AI) au ungependa kuongea na mmiliki wa duka?\n\nJibu:\n1️⃣ - Kuendelea na AI\n2️⃣ - Kuongea na Mmiliki`;
      await saveMessage(conversation.id, "ai", promptMsg);
      return promptMsg;
    }

    // Kama amesha-consent, endelea kama kawaida
    await saveMessage(conversation.id, "customer", userMessage);

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

    await flagNeedsHuman(conversation.id, usedFallback);
    await saveMessage(conversation.id, "ai", finalReplyText);

    return finalReplyText;
  });
}

module.exports = { generateReply, isPersonalContact, logPersonalMessage };
