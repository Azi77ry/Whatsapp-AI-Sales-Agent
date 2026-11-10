// Daraja la kutuma ujumbe kwa mteja kutoka sehemu yoyote ya mfumo (routes, re-engagement, OTP).
// V2: linachagua transport sahihi ya merchant - WhatsApp Cloud API (pamoja na dirisha la saa 24)
// au Baileys (njia ya zamani) - kupitia integrations/whatsapp/messageSender.
const manager = require("./manager");

/**
 * @param {"reply"|"transactional"|"marketing"} kind
 * @returns {Promise<boolean>} true kama umetumwa
 */
async function sendMessage(customerPhone, text, merchantId = 1, kind = "transactional") {
  const result = await sendMessageDetailed(customerPhone, text, merchantId, kind);
  return result.sent;
}

/** Kama sendMessage lakini inarudisha sababu ikishindwa (mf. "outside_24h_window") */
async function sendMessageDetailed(customerPhone, text, merchantId = 1, kind = "transactional") {
  const { sendToCustomer } = require("../integrations/whatsapp/messageSender");
  return sendToCustomer({ merchantId, customerPhone, text, kind });
}

// Hifadhi sock ya kwanza tu kwa ajili ya debug kama inatumiwa
function setSocket(sock) {
  if (sock) {
    manager.activeSessions.set(1, sock);
  }
}

module.exports = { setSocket, sendMessage, sendMessageDetailed };
