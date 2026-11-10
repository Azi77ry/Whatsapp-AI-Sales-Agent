// Usimamizi wa miunganiko ya WhatsApp Cloud API kwa kila merchant.
// Sheria kuu: namba moja inahudumiwa na adapter MOJA tu (Cloud API au Baileys, si zote mbili).

const prisma = require("../../db/client");
const cloudApi = require("./cloudApiClient");
const tokenService = require("./tokenService");
const tenantResolver = require("../../services/tenantResolver");
const logger = require("../../utils/logger");

class ConnectionError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "ConnectionError";
    this.status = status;
  }
}

const SAFE_FIELDS = {
  id: true,
  merchantId: true,
  provider: true,
  phoneNumberId: true,
  phoneE164: true,
  displayPhoneNumber: true,
  verifiedName: true,
  status: true,
  suspendedByAdmin: true,
  qualityRating: true,
  messagingLimitTier: true,
  lastConnectedAt: true,
  lastError: true,
  lastErrorAt: true,
  createdAt: true,
  account: { select: { id: true, wabaId: true, businessId: true, name: true, status: true } },
};

const usesCloudCache = new Map(); // merchantId -> { value, at }

/** Je, merchant huyu yuko kwenye Cloud API? (basi Baileys isimhudumie kamwe) */
async function merchantUsesCloudApi(merchantId) {
  const mId = parseInt(merchantId, 10);
  const hit = usesCloudCache.get(mId);
  if (hit && Date.now() - hit.at < 30 * 1000) return hit.value;
  const count = await prisma.whatsAppPhoneNumber.count({
    where: { merchantId: mId, provider: "cloud_api", status: { not: "disconnected" } },
  });
  usesCloudCache.set(mId, { value: count > 0, at: Date.now() });
  return count > 0;
}

/** Muunganiko unaoweza kutuma ujumbe sasa hivi (au null) */
async function getActiveCloudConnection(merchantId) {
  return prisma.whatsAppPhoneNumber.findFirst({
    where: { merchantId: parseInt(merchantId, 10), provider: "cloud_api", status: "connected", suspendedByAdmin: false },
    include: { account: true },
    orderBy: { lastConnectedAt: "desc" },
  });
}

function invalidateCaches(merchantId, phoneNumberId) {
  if (merchantId) usesCloudCache.delete(parseInt(merchantId, 10));
  tenantResolver.invalidate(phoneNumberId);
}

/**
 * Unganisha namba kwa kutumia taarifa za Meta zilizopo tayari (WABA ID, Phone Number ID, token).
 * Inatumika na: Embedded Signup (baada ya kubadilisha code), na Super Admin kwa namba ya test ya Meta.
 */
async function connect({ merchantId, wabaId, phoneNumberId, accessToken, businessId = null, tokenType, scopes, expiresAt }) {
  const mId = parseInt(merchantId, 10);
  if (!wabaId || !phoneNumberId || !accessToken) {
    throw new ConnectionError("wabaId, phoneNumberId na accessToken vinahitajika.");
  }

  // 1. Thibitisha na Meta kwamba token inaweza kufikia namba hii
  let info;
  try {
    info = await cloudApi.getPhoneNumber({ phoneNumberId, token: accessToken });
  } catch (err) {
    logger.warn("whatsapp.connect.validation_failed", { merchantId: mId, phoneNumberId, code: err.code, error: err.message });
    throw new ConnectionError(`Meta imekataa taarifa hizi: ${err.message}`, 422);
  }
  const phoneE164 = String(info.display_phone_number || "").replace(/\D/g, "");
  if (!phoneE164) throw new ConnectionError("Meta haikurudisha namba ya simu.", 422);

  // 2. Zuia namba/WABA ya merchant mwingine
  const [otherPhone, otherAccount, otherBaileys] = await Promise.all([
    prisma.whatsAppPhoneNumber.findFirst({ where: { OR: [{ phoneE164 }, { phoneNumberId: String(phoneNumberId) }], NOT: { merchantId: mId } } }),
    prisma.whatsAppAccount.findFirst({ where: { wabaId: String(wabaId), NOT: { merchantId: mId } } }),
    prisma.merchant.findFirst({ where: { waPhone: phoneE164, NOT: { id: mId } }, select: { id: true } }),
  ]);
  if (otherPhone || otherAccount || otherBaileys) {
    throw new ConnectionError("Namba au akaunti hii tayari imeunganishwa na duka lingine.", 409);
  }

  // 3. Hifadhi akaunti, token (encrypted) na namba
  const account = await prisma.whatsAppAccount.upsert({
    where: { wabaId: String(wabaId) },
    create: { merchantId: mId, wabaId: String(wabaId), businessId, status: "active" },
    update: { businessId: businessId || undefined, status: "active" },
  });
  await tokenService.storeToken({ accountId: account.id, accessToken, tokenType, scopes, expiresAt });

  const phoneData = {
    merchantId: mId,
    accountId: account.id,
    provider: "cloud_api",
    phoneE164,
    displayPhoneNumber: info.display_phone_number,
    verifiedName: info.verified_name || null,
    qualityRating: info.quality_rating || null,
    messagingLimitTier: info.messaging_limit_tier || null,
    status: "connected",
    lastConnectedAt: new Date(),
    lastError: null,
    lastErrorAt: null,
  };
  const phone = await prisma.whatsAppPhoneNumber.upsert({
    where: { phoneNumberId: String(phoneNumberId) },
    create: { phoneNumberId: String(phoneNumberId), ...phoneData },
    update: phoneData,
    select: SAFE_FIELDS,
  });

  invalidateCaches(mId, phoneNumberId);

  // 4. Simamisha Baileys kwa merchant huyu - adapter moja tu kwa namba
  try {
    const manager = require("../../whatsapp/manager");
    await manager.stopSession(mId, false);
  } catch (err) {
    logger.warn("whatsapp.connect.stop_baileys_failed", { merchantId: mId, error: err.message });
  }

  logger.info("whatsapp.connected", { merchantId: mId, phoneNumberId, wabaId });
  return phone;
}

async function listForMerchant(merchantId) {
  return prisma.whatsAppPhoneNumber.findMany({
    where: { merchantId: parseInt(merchantId, 10) },
    select: SAFE_FIELDS,
    orderBy: { createdAt: "desc" },
  });
}

async function listAll() {
  return prisma.whatsAppPhoneNumber.findMany({
    select: { ...SAFE_FIELDS, merchant: { select: { id: true, businessName: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });
}

/** Merchant anakata muunganiko wake (scoped kwa merchantId) */
async function disconnect(merchantId, connectionId) {
  const phone = await prisma.whatsAppPhoneNumber.findFirst({
    where: { id: parseInt(connectionId, 10), merchantId: parseInt(merchantId, 10) },
  });
  if (!phone) throw new ConnectionError("Muunganiko haupo.", 404);

  await prisma.whatsAppPhoneNumber.update({ where: { id: phone.id }, data: { status: "disconnected" } });
  if (phone.accountId) {
    const stillActive = await prisma.whatsAppPhoneNumber.count({
      where: { accountId: phone.accountId, status: { not: "disconnected" } },
    });
    if (stillActive === 0) await tokenService.revoke(phone.accountId);
  }
  invalidateCaches(phone.merchantId, phone.phoneNumberId);
  logger.info("whatsapp.disconnected", { merchantId: phone.merchantId, connectionId: phone.id });
}

/** Super Admin: simamisha / ruhusu muunganiko */
async function setSuspended(connectionId, suspended) {
  const phone = await prisma.whatsAppPhoneNumber.update({
    where: { id: parseInt(connectionId, 10) },
    data: { suspendedByAdmin: Boolean(suspended) },
    select: SAFE_FIELDS,
  });
  invalidateCaches(phone.merchantId, phone.phoneNumberId);
  return phone;
}

async function markError(phoneId, message) {
  await prisma.whatsAppPhoneNumber.update({
    where: { id: phoneId },
    data: { lastError: String(message).slice(0, 500), lastErrorAt: new Date() },
  });
}

module.exports = {
  ConnectionError,
  merchantUsesCloudApi,
  getActiveCloudConnection,
  connect,
  listForMerchant,
  listAll,
  disconnect,
  setSuspended,
  markError,
  invalidateCaches,
};
