// Pipeline ya ujumbe unaoingia kupitia Cloud API (haitegemei umbo la webhook la Meta).
//
//  1. Tambua merchant kwa phone_number_id     6. Mapendeleo (STOP/START/kukasirika)
//  2. Zuia kushughulikia ujumbe mara mbili     7. Rafiki / bot imezimwa / imesimamishwa -> hifadhi tu
//  3. Sasisha mazungumzo + dirisha la saa 24   8. AI engine iliyopo (generateReplyDetailed)
//  4. "Umesomwa" + typing                      9. Hakikisha mmiliki hajachukua mazungumzo
//  5. Sauti -> maandishi                       10. Tuma kupitia Cloud API, hifadhi wamid
//
// Kosa la muda (retryable) linarushwa ili worker ijaribu tena; jibu lililohifadhiwa ("queued")
// linatumwa tena bila kuita AI mara ya pili.

const prisma = require("../db/client");
const { decrypt } = require("../utils/crypto");
const logger = require("../utils/logger");
const tenantResolver = require("./tenantResolver");
const { isMerchantHandling } = require("./humanHandoverService");
const { detectContactPreference, applyContactPreference } = require("./contactPreferences");
const { generateReplyDetailed, logPersonalMessage, getOrCreateConversation, saveMessage } = require("../ai/agent");
const { speechToText, textToSpeech } = require("../ai/voiceService");
const { waIdToJid } = require("../integrations/whatsapp/messageNormalizer");
const cloudAdapter = require("../integrations/whatsapp/adapters/cloudApiAdapter");
const { sendTextViaCloud, recordUsage } = require("../integrations/whatsapp/messageSender");
const tokenService = require("../integrations/whatsapp/tokenService");

const VOICE_FAILED_TEXT = "Samahani, sikufanikiwa kusikia sauti yako vizuri 🎙️. Tafadhali rudia au uandike kwa maandishi nisaidie. 🙏";

/**
 * Tuma jibu lililohifadhiwa (status "queued") na lisasishe kuwa "sent"/"failed".
 */
async function deliverReply({ connection, conversationId, customerWaId, replyMessage, text, replyToProviderId, asVoice }) {
  // 🛡️ Mmiliki amechukua mazungumzo wakati AI inaandaa jibu -> usitume (majibu yasigongane)
  if (await isMerchantHandling(conversationId)) {
    await prisma.message.update({ where: { id: replyMessage.id }, data: { status: "cancelled", statusUpdatedAt: new Date() } });
    return { outcome: "cancelled_human_active" };
  }

  let providerMessageId = null;
  try {
    if (asVoice) {
      const audio = await textToSpeech(text, "sw").catch(() => null);
      if (audio) {
        ({ providerMessageId } = await cloudAdapter.send(connection, {
          to: customerWaId, type: "audio", audio: { buffer: audio, mimeType: "audio/mpeg" }, replyToProviderId,
        }));
        await recordUsage(connection.id, "outbound", "service");
      }
    }
    if (!providerMessageId) {
      ({ providerMessageId } = await sendTextViaCloud(connection, customerWaId, text, { replyToProviderId }));
    }
  } catch (err) {
    if (err.retryable) throw err; // worker itajaribu tena; ujumbe unabaki "queued"
    await prisma.message.update({
      where: { id: replyMessage.id },
      data: { status: "failed", errorCode: String(err.code || err.reason || "send_failed"), statusUpdatedAt: new Date() },
    });
    logger.warn("whatsapp.reply.failed", { conversationId, code: err.code, error: err.message });
    return { outcome: "send_failed" };
  }

  await prisma.message.update({
    where: { id: replyMessage.id },
    data: { status: "sent", providerMessageId, statusUpdatedAt: new Date() },
  });
  return { outcome: "replied", providerMessageId };
}

/** Retry ya tukio lililoshughulikiwa nusu: tuma majibu yaliyobaki "queued" (bila kuita AI tena) */
async function resendPendingReplies({ connection, inboundMessage, customerWaId }) {
  const pending = await prisma.message.findMany({
    where: { inReplyToId: inboundMessage.id, status: "queued" },
    orderBy: { id: "asc" },
  });
  let last = { outcome: "already_processed" };
  for (const reply of pending) {
    last = await deliverReply({
      connection,
      conversationId: inboundMessage.conversationId,
      customerWaId,
      replyMessage: reply,
      text: decrypt(reply.content),
      replyToProviderId: inboundMessage.providerMessageId,
    });
  }
  return last;
}

/**
 * @param {object} msg - InboundMessage kutoka messageNormalizer
 * @returns {Promise<{ outcome: string, merchantId?: number }>}
 */
async function handleInbound(msg) {
  const tenant = await tenantResolver.resolveByPhoneNumberId(msg.phoneNumberId);
  if (!tenant) return { outcome: "ignored", reason: "unknown_phone_number_id" };
  const { merchantId, phone: connection } = tenant;
  if (connection.status === "disconnected") return { outcome: "ignored", reason: "connection_disconnected", merchantId };

  const customerWaId = String(msg.from).replace(/\D/g, "");
  const customerPhone = waIdToJid(customerWaId);
  const inbound = { providerMessageId: msg.providerMessageId, type: msg.type, phoneNumberId: connection.id };

  // 2. Ujumbe huu ulishahifadhiwa? (retry ya worker au Meta kutuma tena)
  const existing = await prisma.message.findUnique({ where: { providerMessageId: msg.providerMessageId } });
  if (existing) {
    const result = await resendPendingReplies({ connection, inboundMessage: existing, customerWaId });
    return { ...result, merchantId };
  }

  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { id: true, status: true, botActive: true },
  });
  if (!merchant) return { outcome: "ignored", reason: "merchant_not_found" };

  // 3. Mazungumzo + dirisha la saa 24 (linaanza na ujumbe huu wa mteja)
  const conversation = await getOrCreateConversation(customerPhone, msg.customerName, merchantId);
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { customerWaId, lastInboundAt: new Date(msg.timestamp || Date.now()) },
  });
  await recordUsage(connection.id, "inbound", "service");

  let canReply = merchant.status !== "suspended" && !connection.suspendedByAdmin && connection.status === "connected";

  // Token haipo/imeisha muda: usipoteze gharama ya AI kwa jibu lisiloweza kutumwa. Hifadhi ujumbe ili
  // mmiliki auone; muunganiko unawekwa "error" (tokenService) na mmiliki anaarifiwa kuunganisha upya.
  let tokenProblem = null;
  if (canReply) {
    try {
      await tokenService.getAccessToken(connection.accountId);
    } catch (err) {
      if (err.name !== "TokenUnavailableError") throw err;
      tokenProblem = `token_${err.reason}`;
      canReply = false;
    }
  }

  // 4. "Umesomwa" + typing (best effort)
  if (canReply) cloudAdapter.markRead(connection, msg.providerMessageId, { typing: true }).catch(() => {});

  const saveAndDeliver = async (inboundRow, text) => {
    const replyMessage = await saveMessage(conversation.id, "ai", text, {
      direction: "outbound", status: "queued", inReplyToId: inboundRow.id, phoneNumberId: connection.id,
    });
    return deliverReply({
      connection, conversationId: conversation.id, customerWaId, replyMessage, text, replyToProviderId: msg.providerMessageId,
    });
  };
  const inboundMeta = { direction: "inbound", type: msg.type, providerMessageId: msg.providerMessageId, phoneNumberId: connection.id };

  // 5. Maandishi ya ujumbe (sauti -> maandishi)
  let text = msg.text;
  const isVoice = msg.type === "audio" && Boolean(msg.media?.id);
  if (isVoice) {
    try {
      const media = await cloudAdapter.downloadMedia(connection, msg.media.id);
      text = await speechToText(media.buffer, media.mimeType || "audio/ogg");
    } catch (err) {
      if (err.retryable) throw err;
      logger.warn("whatsapp.voice.failed", { merchantId, error: err.message });
      text = null;
    }
    if (!text) {
      const row = await saveMessage(conversation.id, "customer", "[Voice note]", inboundMeta);
      const result = canReply ? await saveAndDeliver(row, VOICE_FAILED_TEXT) : { outcome: "logged" };
      return { ...result, merchantId };
    }
  }

  if (!text) {
    if (msg.type === "reaction") return { outcome: "ignored", reason: "reaction", merchantId };
    // Picha bila maelezo, sticker, aina isiyotumika: hifadhi ili mmiliki aone, AI haijibu
    await logPersonalMessage({ customerPhone, customerName: msg.customerName, userMessage: `[${msg.type}]`, merchantId, inbound });
    return { outcome: "logged", reason: `no_text_${msg.type}`, merchantId };
  }

  // 6. STOP / START / mteja amekasirika
  const preference = detectContactPreference(text);
  if (preference) {
    const row = await saveMessage(conversation.id, "customer", text, inboundMeta);
    const confirmText = await applyContactPreference({ merchantId, conversationId: conversation.id, customerPhone, preference });
    const result = canReply && merchant.botActive ? await saveAndDeliver(row, confirmText) : { outcome: "logged" };
    return { ...result, preference, merchantId };
  }

  // 7. Rafiki (personal), bot imezimwa, au imesimamishwa -> hifadhi tu
  if (conversation.contactType === "personal" || !merchant.botActive || !canReply) {
    await logPersonalMessage({ customerPhone, customerName: msg.customerName, userMessage: text, merchantId, inbound });
    const reason = conversation.contactType === "personal" ? "personal_contact" : tokenProblem || (merchant.botActive ? "cannot_reply" : "bot_inactive");
    return { outcome: "logged", reason, merchantId };
  }

  // 8. AI engine iliyopo (consent, human takeover, limits, tools, fallback - zote ndani)
  const result = await generateReplyDetailed({
    customerPhone, customerName: msg.customerName, userMessage: text, merchantId, inbound,
  });
  if (!result.text || !result.replyMessageId) return { outcome: "silent", merchantId };

  // 9-10. Tuma
  const replyMessage = await prisma.message.findUnique({ where: { id: result.replyMessageId } });
  const delivered = await deliverReply({
    connection, conversationId: conversation.id, customerWaId, replyMessage, text: result.text,
    replyToProviderId: msg.providerMessageId, asVoice: isVoice,
  });
  return { ...delivered, merchantId };
}

module.exports = { handleInbound, deliverReply };
