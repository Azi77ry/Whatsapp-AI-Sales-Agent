// Kutuma ujumbe kwa mteja kupitia transport sahihi ya merchant (Cloud API au Baileys),
// pamoja na sheria za WhatsApp: dirisha la saa 24, opt-out, na kurekodi matumizi.

const prisma = require("../../db/client");
const config = require("../../config");
const cloudAdapter = require("./adapters/cloudApiAdapter");
const connectionService = require("./connectionService");
const { jidToWaId } = require("./messageNormalizer");
const { parseImageTag, resolveOutboundImage } = require("./mediaHandler");
const logger = require("../../utils/logger");

const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

function todayEAT() {
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function recordUsage(phoneId, direction, category) {
  try {
    await prisma.whatsAppUsageRecord.upsert({
      where: { phoneNumberId_date_direction_category: { phoneNumberId: phoneId, date: todayEAT(), direction, category } },
      create: { phoneNumberId: phoneId, date: todayEAT(), direction, category, count: 1 },
      update: { count: { increment: 1 } },
    });
  } catch (err) {
    logger.warn("whatsapp.usage.record_failed", { phoneId, error: err.message });
  }
}

function isWithinServiceWindow(conversation, now = Date.now()) {
  return Boolean(conversation?.lastInboundAt && now - new Date(conversation.lastInboundAt).getTime() < CUSTOMER_SERVICE_WINDOW_MS);
}

/**
 * Tuma maandishi (na picha kama kuna [IMAGE: ...]) kupitia muunganiko wa Cloud API.
 * Inarusha GraphApiError - mwitaji ndiye anaamua kurudia au la.
 */
async function sendTextViaCloud(connection, waId, text, { replyToProviderId } = {}) {
  const { cleanText, imageRef } = parseImageTag(text);
  const image = imageRef ? resolveOutboundImage(imageRef) : null;
  const result = image
    ? await cloudAdapter.send(connection, { to: waId, type: "image", image, caption: cleanText || undefined, replyToProviderId })
    : await cloudAdapter.send(connection, { to: waId, type: "text", text: cleanText || text, replyToProviderId });
  await recordUsage(connection.id, "outbound", "service");
  return result;
}

/**
 * Tuma ujumbe kwa mteja wa merchant. Inatumika na routes (oda, special requests), re-engagement, OTP.
 * @param {"reply"|"transactional"|"marketing"} kind
 * @returns {Promise<{ sent: boolean, provider?: string, providerMessageId?: string, reason?: string }>}
 */
async function sendToCustomer({ merchantId, customerPhone, text, kind = "transactional" }) {
  const mId = parseInt(merchantId, 10);
  const connection = await connectionService.getActiveCloudConnection(mId);

  if (!connection) {
    if (await connectionService.merchantUsesCloudApi(mId)) {
      return { sent: false, provider: "cloud_api", reason: "cloud_connection_unavailable" };
    }
    if (!config.features.baileys) return { sent: false, reason: "no_connection" };
    const manager = require("../../whatsapp/manager");
    const ok = await manager.sendMessage(mId, customerPhone, text, kind);
    return { sent: Boolean(ok), provider: "baileys", reason: ok ? undefined : "baileys_send_failed" };
  }

  const waId = jidToWaId(customerPhone);
  if (!waId) return { sent: false, provider: "cloud_api", reason: "no_phone_number" }; // mf. @lid ya zamani

  const conversation = await prisma.conversation.findUnique({
    where: { merchantId_customerPhone: { merchantId: mId, customerPhone } },
    select: { lastInboundAt: true, optedOut: true },
  });
  if (kind === "marketing" && conversation?.optedOut) return { sent: false, provider: "cloud_api", reason: "opted_out" };
  // 🛡️ Nje ya saa 24 tangu mteja aandike: free-form hairuhusiwi - template iliyoidhinishwa inahitajika
  if (!isWithinServiceWindow(conversation)) {
    logger.info("whatsapp.send.outside_window", { merchantId: mId, kind });
    return { sent: false, provider: "cloud_api", reason: "outside_24h_window" };
  }

  try {
    const { providerMessageId } = await sendTextViaCloud(connection, waId, text);
    return { sent: true, provider: "cloud_api", providerMessageId };
  } catch (err) {
    logger.warn("whatsapp.send.failed", { merchantId: mId, kind, code: err.code, error: err.message });
    if (err.isOutsideWindow) return { sent: false, provider: "cloud_api", reason: "outside_24h_window" };
    return { sent: false, provider: "cloud_api", reason: err.retryable ? "temporary_error" : "send_failed" };
  }
}

module.exports = { sendToCustomer, sendTextViaCloud, recordUsage, isWithinServiceWindow, CUSTOMER_SERVICE_WINDOW_MS };
