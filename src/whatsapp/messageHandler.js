// Inashughulikia ujumbe mmoja unaoingia: kutoa maandishi, kupuuza vitu visivyohitajika
// (groups, status updates, ujumbe kutoka kwako mwenyewe), na kutuma jibu la AI - Phase 1
// Imeboreshwa kwa Multi-Tenant SaaS.

const { generateReply, isPersonalContact, logPersonalMessage } = require("../ai/agent");
const prisma = require("../db/client");

function extractTextFromMessage(msg) {
  const m = msg.message;
  if (!m) return null;

  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    null
  );
}

// Jaribu kutuma ujumbe mara nyingi kama kunatokea kosa la muunganiko wa muda mfupi
async function sendWithRetry(sock, remoteJid, replyText, maxRetries = 3) {
  const RETRY_DELAY_MS = 2000;

  // Extract IMAGE tag if present
  let imageUrl = null;
  let cleanText = replyText;
  const imageMatch = replyText.match(/\[IMAGE:\s*(.+?)\]/i);
  if (imageMatch) {
    imageUrl = imageMatch[1].trim();
    cleanText = replyText.replace(imageMatch[0], "").trim();
    
    // Check if it's a local upload
    if (imageUrl.startsWith("/uploads/")) {
      const path = require("path");
      const fs = require("fs");
      const localPath = path.join(__dirname, "../../public", imageUrl);
      if (fs.existsSync(localPath)) {
        imageUrl = { url: localPath }; // Baileys reads from local path
      } else {
        imageUrl = { url: imageUrl };
      }
    } else {
      imageUrl = { url: imageUrl };
    }
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (imageUrl) {
        await sock.sendMessage(remoteJid, { image: imageUrl, caption: cleanText });
      } else {
        await sock.sendMessage(remoteJid, { text: cleanText });
      }
      return true;
    } catch (err) {
      const isConnectionError =
        err?.output?.statusCode === 428 ||
        err?.message?.includes("Connection") ||
        err?.message?.includes("Timed Out") ||
        err?.message?.includes("lost");

      if (isConnectionError && attempt < maxRetries) {
        console.warn(
          `⚠️  Kutuma kumeshindwa (jaribio ${attempt}/${maxRetries}): ${err.message} — inarudia baada ya sekunde ${RETRY_DELAY_MS / 1000}...`
        );
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      } else {
        throw err;
      }
    }
  }
  return false;
}

async function handleIncomingMessage(sock, msg, merchantId = 1) {
  const manager = require("./manager"); // dynamic require to break circular dependency
  const mId = parseInt(merchantId, 10);

  // Puuza ujumbe ambao AI mwenyewe imetuma (epuka loop)
  if (msg.key.fromMe) return;

  const remoteJid = msg.key.remoteJid;

  // Puuza groups, broadcast, na newsletter
  if (
    remoteJid.endsWith("@g.us") ||
    remoteJid === "status@broadcast" ||
    remoteJid.endsWith("@newsletter")
  ) return;

  const text = extractTextFromMessage(msg);
  if (!text) {
    const m = msg.message;
    // Jibu kwa heshima kama mteja ametuma Voice Note au Sauti
    if (m?.audioMessage) {
      await sendWithRetry(sock, remoteJid, "Samahani, bado sijajifunza kusikiliza sauti (Voice Notes) 🎙️. Tafadhali andika ujumbe wako kwa maandishi ili niweze kukusaidia kikamilifu. 🙏");
    }
    // Kama ni stika au kitu kingine, puuza kimya kimya
    return;
  }

  const customerName = msg.pushName || null;

  console.log(`📩 Merchant #${mId} - Ujumbe kutoka ${remoteJid} (${customerName}): ${text}`);

  // Angalia kama namba hii imewekwa alama ya "Rafiki (Personal)"
  const isPersonal = await isPersonalContact(remoteJid, mId);
  if (isPersonal) {
    await logPersonalMessage({ customerPhone: remoteJid, customerName, userMessage: text, merchantId: mId });
    console.log(`👤 Merchant #${mId} - ${remoteJid} ni "Rafiki" - bot haijibu.`);
    return;
  }

  // Angalia kama bot ipo active kwa duka hili
  if (!manager.isBotActive(mId)) {
    await logPersonalMessage({ customerPhone: remoteJid, customerName, userMessage: text, merchantId: mId });
    console.log(`⏸️  Merchant #${mId} - Bot imezimwa - ujumbe umehifadhiwa tu.`);
    return;
  }

  try {
    await sock.sendPresenceUpdate("composing", remoteJid);
  } catch (_) {}

  // 🛡️ ENFORCE AI LIMITS (SUPER ADMIN FEATURE)
  try {
    const merchant = await prisma.merchant.findUnique({
      where: { id: mId },
      select: { aiLimit: true, aiUsage: true }
    });

    if (merchant && merchant.aiUsage >= merchant.aiLimit) {
      console.log(`🚫 Merchant #${mId} - Imefikia kikomo cha AI (${merchant.aiUsage}/${merchant.aiLimit}). AI imesimamishwa.`);
      
      // Optional: Send a fallback message to the customer or just stay silent
      // Let's stay silent so the merchant can reply manually, or send a brief info:
      // await sendWithRetry(sock, remoteJid, "*(AI Auto-Reply)* Samahani, nipo nje ya mtandao kwa sasa. Mmiliki wa duka atakujibu hivi punde.");
      
      // Save it as a personal message so it shows in conversations for human handling
      await logPersonalMessage({ customerPhone: remoteJid, customerName, userMessage: text, merchantId: mId });
      return;
    }
  } catch (err) {
    console.error(`⚠️ Hitilafu kuangalia AI Limit kwa Merchant #${mId}:`, err.message);
  }

  try {
    const replyText = await generateReply({
      customerPhone: remoteJid,
      customerName,
      userMessage: text,
      merchantId: mId,
    });

    if (replyText) {
      const sent = await sendWithRetry(sock, remoteJid, replyText);
      if (sent) {
        console.log(`📤 Merchant #${mId} - Jibu limetumwa kwa ${remoteJid}: ${replyText}`);
        
        // Increment AI Usage
        await prisma.merchant.update({
          where: { id: mId },
          data: { aiUsage: { increment: 1 } }
        });
      }
    } else {
      console.log(`🔇 Merchant #${mId} - Bot iko kimya (mteja aliomba kuongea na mmiliki au ipo personal) kwa ${remoteJid}.`);
    }
  } catch (err) {
    console.error(`⚠️  Merchant #${mId} - Hitilafu ya kushughulikia ujumbe (${remoteJid}):`, err.message);
  }
}

module.exports = { handleIncomingMessage };
