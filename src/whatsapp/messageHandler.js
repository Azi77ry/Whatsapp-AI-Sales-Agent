// Inashughulikia ujumbe mmoja unaoingia: kutoa maandishi, kupuuza vitu visivyohitajika
// (groups, status updates, ujumbe kutoka kwako mwenyewe), na kutuma jibu la AI - Phase 1
// Imeboreshwa kwa Multi-Tenant SaaS.

const { generateReply, isPersonalContact, logPersonalMessage } = require("../ai/agent");
const { speechToText, textToSpeech } = require("../ai/voiceService");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const pino = require("pino");
const prisma = require("../db/client");

// Anti-Bot Rate Limiting (In-Memory)
const userMessageCounts = new Map();
const RATE_LIMIT_WINDOW_MS = 60000; // Sekunde 60
const MAX_MESSAGES_PER_WINDOW = 6; // Meseji 6 kwa dakika
const BLOCK_DURATION_MS = 15 * 60 * 1000; // Dakika 15

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
async function sendWithRetry(sock, remoteJid, replyText, maxRetries = 3, originalMsg = null) {
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
      const sendOptions = {};
      
      // KAMA NI @lid, USI-QUOTE MESEJI KABISA ILI KUKWEPA ERROR 463 YA META!
      if (originalMsg && !remoteJid.includes("@lid")) {
        sendOptions.quoted = originalMsg; 
      }
      
      if (imageUrl) {
        console.log(`[DEBUG] Kutuma picha kwenda ${remoteJid}...`);
        await sock.sendMessage(remoteJid, { image: imageUrl, caption: cleanText }, sendOptions);
      } else {
        console.log(`[DEBUG] Kutuma maandishi kwenda ${remoteJid}: "${cleanText.substring(0, 30)}..."`);
        await sock.sendMessage(remoteJid, { text: cleanText }, sendOptions);
        console.log(`[DEBUG] Maandishi yametumwa kikamilifu kwenda ${remoteJid}!`);
      }
      
      // Turn off composing state after successful send
      await sock.sendPresenceUpdate("paused", remoteJid).catch(() => {});
      
      return true;
    } catch (err) {
      console.error(`[DEBUG ERROR] sendMessage imeshindwa (jaribio ${attempt}):`, err);
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

  // 🛡️ PUUZA MESEJI ZA ZAMANI ZILIZO-SYNC WAKATI WA KUUNGANISHA (HISTORY SYNC)
  if (msg.messageTimestamp) {
    const msgTimeSec = Number(msg.messageTimestamp);
    const nowSec = Math.floor(Date.now() / 1000);
    const msgAgeSec = nowSec - msgTimeSec;

    // Kama meseji ni ya zamani zaidi ya sekunde 120 (dakika 2), puuza kimya kimya
    if (msgAgeSec > 120 || msgAgeSec < -60) {
      return;
    }
  }

  let remoteJid = msg.key.remoteJid;
  
  // LOG THE LID ISSUE TO DEBUG FULLY
  if (remoteJid.includes("@lid")) {
    const fs = require('fs');
    try {
      fs.writeFileSync('lid_debug.json', JSON.stringify(msg, null, 2));
      console.log(`🔍 [LID DEBUG] Saved full message to lid_debug.json`);
    } catch (e) {
      console.error('Failed to save lid_debug.json', e);
    }
  }

  // Puuza groups, broadcast, na newsletter
  if (
    remoteJid.endsWith("@g.us") ||
    remoteJid === "status@broadcast" ||
    remoteJid.endsWith("@newsletter")
  ) return;

  // 🛡️ ANTI-BOT LOOP PROTECTION (RATE LIMITING)
  const now = Date.now();
  if (!userMessageCounts.has(remoteJid)) {
    userMessageCounts.set(remoteJid, { count: 1, firstMessageTime: now, blockedUntil: 0 });
  } else {
    const userData = userMessageCounts.get(remoteJid);
    
    // Kama bado amefungiwa, puuza ujumbe moja kwa moja
    if (userData.blockedUntil > now) {
      return; 
    }

    // Kama muda umepita tangu meseji ya kwanza, anza kuhesabu upya
    if (now - userData.firstMessageTime > RATE_LIMIT_WINDOW_MS) {
      userData.count = 1;
      userData.firstMessageTime = now;
    } else {
      userData.count++;
      // Ikiwa ametuma meseji nyingi sana mfululizo (zaidi ya 6 ndani ya sekunde 60)
      if (userData.count > MAX_MESSAGES_PER_WINDOW) {
        console.log(`🚨 SPAM/BOT LOOP DETECTED! Kuzuia namba ${remoteJid} kwa dakika 15.`);
        userData.blockedUntil = now + BLOCK_DURATION_MS;
        
        // Tuma ujumbe mmoja wa kumpa taarifa mteja kisha nyamaza
        await sendWithRetry(sock, remoteJid, "⚠️ *Kizuizi cha Usalama:* Mfumo umegundua meseji zinatumwa kwa kasi isiyo ya kawaida (Inawezekana ni Auto-Responder). Tumesitisha mazungumzo haya kwa dakika 15 ili kulinda usalama. Mmiliki atakujibu hivi punde.", 3, msg);
        
        // Hifadhi kwenye database ili mmiliki aone (Kama "Personal" ili Bot isijibu tena mpaka ifunguliwe)
        await logPersonalMessage({ customerPhone: remoteJid, customerName: msg.pushName || "Unknown", userMessage: "[SYSTEM AUTO-BLOCK] Mteja huyu amefungiwa kwa muda kutokana na kutuma meseji nyingi mfululizo (Spam/Bot Loop).", merchantId: mId });
        return;
      }
    }
  }

  let isAudioMessage = false;
  let text = extractTextFromMessage(msg);

  // 🎙️ KAMA MTEJA AMETUMA VOICE NOTE / SAUTI:
  const m = msg.message;
  if (!text && m?.audioMessage) {
    isAudioMessage = true;
    try {
      await sock.sendPresenceUpdate("recording", remoteJid).catch(() => {});
      console.log(`🎙️ Merchant #${mId} - Imepokea Voice Note kutoka ${remoteJid}. Inapakua na kutafsiri sauti...`);
      
      const audioBuffer = await downloadMediaMessage(
        msg,
        "buffer",
        {},
        { logger: pino({ level: "silent" }) }
      );

      if (audioBuffer) {
        text = await speechToText(audioBuffer, m.audioMessage.mimetype || "audio/ogg");
      }
    } catch (err) {
      console.error(`⚠️ Imeshindwa kutafsiri Voice Note (${remoteJid}):`, err.message);
      await sendWithRetry(sock, remoteJid, "Samahani, sikufanikiwa kusikia sauti yako vizuri 🎙️. Tafadhali rudia au uandike kwa maandishi nisaidie. 🙏", 3, msg);
      return;
    }
  }

  if (!text) return; // Puuza kama hakuna maandishi wala sauti

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
    await sock.sendPresenceUpdate(isAudioMessage ? "recording" : "composing", remoteJid);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Delay for natural typing/recording
  } catch (_) {}

  // 🛡️ ENFORCE AI LIMITS (SUPER ADMIN FEATURE)
  try {
    const merchant = await prisma.merchant.findUnique({
      where: { id: mId },
      select: { aiLimit: true, aiUsage: true }
    });

    if (merchant && merchant.aiUsage >= merchant.aiLimit) {
      console.log(`🚫 Merchant #${mId} - Imefikia kikomo cha AI (${merchant.aiUsage}/${merchant.aiLimit}). AI imesimamishwa.`);
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
      // 🎙️ KAMA MTEJA ALITUMA VOICE NOTE, MJIBU KWA VOICE NOTE (SAUTI) PIA!
      if (isAudioMessage) {
        try {
          console.log(`🔊 Merchant #${mId} - Inatengeneza jibu la sauti (Voice Note) kwa ${remoteJid}...`);
          const audioReplyBuffer = await textToSpeech(replyText, "sw");

          if (audioReplyBuffer) {
            await sock.sendPresenceUpdate("recording", remoteJid).catch(() => {});
            const sendOptions = {};
            if (!remoteJid.includes("@lid")) sendOptions.quoted = msg;

            await sock.sendMessage(
              remoteJid,
              { audio: audioReplyBuffer, mimetype: "audio/mpeg", ptt: true },
              sendOptions
            );
            console.log(`🎙️ Merchant #${mId} - Jibu la Voice Note limetumwa kikamilifu kwa ${remoteJid}!`);
          }
        } catch (voiceErr) {
          console.error(`⚠️ Imeshindwa kutuma jibu la sauti:`, voiceErr.message);
        }
      }

      // Tuma pia jibu la maandishi (au kama mteja alituma maandishi)
      const sent = await sendWithRetry(sock, remoteJid, replyText, 3, msg);
      if (sent) {
        console.log(`📤 Merchant #${mId} - Jibu limetumwa kwa ${remoteJid}: ${replyText}`);
        
        // Increment AI Usage
        await prisma.merchant.update({
          where: { id: mId },
          data: { aiUsage: { increment: 1 } }
        });
      }
    } else {
      console.log(`🔇 Merchant #${mId} - Bot iko kimya kwa ${remoteJid}.`);
    }
  } catch (err) {
    console.error(`⚠️  Merchant #${mId} - Hitilafu ya kushughulikia ujumbe (${remoteJid}):`, err.message);
  } finally {
    // ALWAYS turn off typing/recording indicator!
    await sock.sendPresenceUpdate("paused", remoteJid).catch(() => {});
  }
}

module.exports = { handleIncomingMessage };
