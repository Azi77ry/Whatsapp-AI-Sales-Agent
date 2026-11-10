// Usimamizi wa access tokens za Meta: kuhifadhi (encrypted), kusoma, kufuatilia muda na kubatilisha.
// 🛡️ Token haitoki kamwe nje ya server (haiendi frontend wala kwenye logs).

const prisma = require("../../db/client");
const { encryptSecret, decryptSecret, needsReencryption } = require("../../utils/crypto");
const logger = require("../../utils/logger");

class TokenUnavailableError extends Error {
  constructor(reason, accountId) {
    super(`Access token haipatikani (${reason})`);
    this.name = "TokenUnavailableError";
    this.reason = reason;
    this.accountId = accountId;
    this.retryable = false;
  }
}

async function storeToken({ accountId, accessToken, tokenType = "business_integration", scopes = null, expiresAt = null }) {
  const encryptedToken = encryptSecret(accessToken); // inarusha kama TOKEN_ENCRYPTION_KEY haipo - haihifadhi plaintext
  const data = {
    encryptedToken,
    tokenType,
    scopes: Array.isArray(scopes) ? scopes.join(",") : scopes,
    expiresAt,
    status: "valid",
    revokedAt: null,
    lastValidatedAt: new Date(),
  };
  return prisma.whatsAppCredential.upsert({
    where: { accountId },
    create: { accountId, ...data },
    update: data,
    select: { id: true, accountId: true, status: true, expiresAt: true }, // usirudishe encryptedToken
  });
}

/** @returns {Promise<string>} token halisi - itumike PAPO HAPO kwenye ombi la Graph API tu */
async function getAccessToken(accountId) {
  const cred = await prisma.whatsAppCredential.findUnique({ where: { accountId } });
  if (!cred) throw new TokenUnavailableError("missing", accountId);
  if (cred.revokedAt || cred.status === "revoked") throw new TokenUnavailableError("revoked", accountId);
  if (cred.status === "invalid") throw new TokenUnavailableError("invalid", accountId);
  if (cred.expiresAt && cred.expiresAt <= new Date()) {
    await markInvalid(accountId, "expired");
    throw new TokenUnavailableError("expired", accountId);
  }

  const token = decryptSecret(cred.encryptedToken);
  if (needsReencryption(cred.encryptedToken)) {
    // Key rotation: iandike upya kwa key mpya
    await prisma.whatsAppCredential.update({ where: { id: cred.id }, data: { encryptedToken: encryptSecret(token) } });
  }
  return token;
}

/** Meta imekataa token (code 190) au imeisha muda: simamisha matumizi hadi merchant aunganishe upya */
async function markInvalid(accountId, reason) {
  await prisma.whatsAppCredential.updateMany({ where: { accountId }, data: { status: "invalid" } });
  await prisma.whatsAppPhoneNumber.updateMany({
    where: { accountId, provider: "cloud_api" },
    data: { status: "error", lastError: `token_${reason}`, lastErrorAt: new Date() },
  });
  logger.warn("whatsapp.token.invalid", { accountId, reason });
}

async function revoke(accountId) {
  await prisma.whatsAppCredential.updateMany({
    where: { accountId },
    data: { status: "revoked", revokedAt: new Date(), encryptedToken: "tok1:revoked" },
  });
}

module.exports = { storeToken, getAccessToken, markInvalid, revoke, TokenUnavailableError };
