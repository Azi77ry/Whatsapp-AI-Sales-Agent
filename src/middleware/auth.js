const jwt = require("jsonwebtoken");
const config = require("../config");
const prisma = require("../db/client");

// 🛡️ Hali ya merchant (active/suspended) inakaguliwa kila ombi - token ya siku 7 isiendelee kufanya kazi
// baada ya Super Admin kumsimamisha. Cache fupi inapunguza maswali kwa DB.
const STATUS_TTL_MS = 30 * 1000;
const statusCache = new Map(); // merchantId -> { status, at }

async function merchantStatus(merchantId) {
  const hit = statusCache.get(merchantId);
  if (hit && Date.now() - hit.at < STATUS_TTL_MS) return hit.status;
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId }, select: { status: true } });
  const status = merchant ? merchant.status : "deleted";
  statusCache.set(merchantId, { status, at: Date.now() });
  return status;
}

/** Itumike baada ya kubadilisha hali ya merchant (mf. Super Admin amemsimamisha) */
function invalidateMerchantStatus(merchantId) {
  statusCache.delete(parseInt(merchantId, 10));
}

async function authMiddleware(req, res, next) {
  // Ruhusu kupita bila token kwa endpoints za login na register (ingawa hazipo hapa, ni salama kuwa na ulinzi huu)
  if (req.path.startsWith("/auth/")) {
    return next();
  }

  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Ufikiaji umekataliwa. Token inahitajika." });
  }

  let verified;
  try {
    verified = jwt.verify(token, config.jwtSecret);
  } catch (err) {
    return res.status(403).json({ error: "Token si sahihi au imeisha muda wake." });
  }

  try {
    const status = await merchantStatus(parseInt(verified.merchantId, 10));
    if (status !== "active") {
      return res.status(403).json({ error: "Akaunti yako imesimamishwa. Wasiliana na msimamizi." });
    }
  } catch (err) {
    return next(err);
  }

  req.merchantId = verified.merchantId;
  req.merchantEmail = verified.email;
  next();
}

module.exports = authMiddleware;
module.exports.invalidateMerchantStatus = invalidateMerchantStatus;
