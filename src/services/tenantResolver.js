// Kutambua merchant (tenant) kutoka kwa Phone Number ID ya Meta.
// 🛡️ Hiki ndicho chanzo PEKEE cha merchantId kwa webhooks - hatuamini merchantId yoyote ndani ya payload.

const prisma = require("../db/client");

const CACHE_TTL_MS = 60 * 1000;
const cache = new Map(); // phoneNumberId -> { value, at }

/**
 * @returns {Promise<null | { merchantId, phone, account }>}
 */
async function resolveByPhoneNumberId(phoneNumberId) {
  if (!phoneNumberId) return null;
  const hit = cache.get(phoneNumberId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const phone = await prisma.whatsAppPhoneNumber.findUnique({
    where: { phoneNumberId: String(phoneNumberId) },
    include: { account: true },
  });
  const value = phone && phone.provider === "cloud_api" ? { merchantId: phone.merchantId, phone, account: phone.account } : null;
  cache.set(phoneNumberId, { value, at: Date.now() });
  return value;
}

function invalidate(phoneNumberId) {
  if (phoneNumberId) cache.delete(String(phoneNumberId));
  else cache.clear();
}

module.exports = { resolveByPhoneNumberId, invalidate };
