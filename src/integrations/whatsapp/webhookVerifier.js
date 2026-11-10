// Uthibitisho wa webhook za Meta:
//  - GET: usajili wa webhook (hub.mode / hub.verify_token / hub.challenge)
//  - POST: sahihi X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(rawBody, App Secret)

const crypto = require("crypto");

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * @returns {string|null} challenge ya kurudisha, au null kama uthibitisho umeshindwa
 */
function verifySubscription(query, expectedToken) {
  if (!expectedToken) return null; // Bila token iliyowekwa, usikubali usajili wowote
  const mode = query["hub.mode"];
  const token = query["hub.verify_token"];
  const challenge = query["hub.challenge"];
  if (mode !== "subscribe" || typeof token !== "string" || typeof challenge !== "string") return null;
  return safeEqual(token, expectedToken) ? challenge : null;
}

/**
 * @param {Buffer} rawBody - body halisi kama ilivyopokelewa (kabla ya JSON.parse)
 * @param {string} signatureHeader - thamani ya X-Hub-Signature-256
 * @param {string} appSecret - Meta App Secret
 */
function verifySignature(rawBody, signatureHeader, appSecret) {
  if (!appSecret || !Buffer.isBuffer(rawBody) || typeof signatureHeader !== "string") return false;
  if (!signatureHeader.startsWith("sha256=")) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  return safeEqual(signatureHeader, expected);
}

module.exports = { verifySubscription, verifySignature };
