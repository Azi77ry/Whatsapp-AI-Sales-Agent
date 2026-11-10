// Mapendeleo ya mteja: kujiondoa (STOP), kurudi (START), au kukasirika (mpe mmiliki).
// Inatumiwa na transports zote (Baileys na Cloud API) ili tabia iwe sawa kila mahali.

const prisma = require("../db/client");
const { jidToWaId } = require("../integrations/whatsapp/messageNormalizer");

// Lazima ujumbe uwe neno hili tu (siyo kuwemo ndani) - "sitaki hiyo rangi" si opt-out
const OPT_OUT_PHRASES = [
  "stop", "unsubscribe", "acha", "sitaki ujumbe", "sitaki meseji", "acha kunitumia",
  "usinitumie", "usinitumie ujumbe", "usinitumie meseji", "niondoe", "stop messages",
];
const OPT_IN_PHRASES = ["start", "anza", "anza tena", "subscribe"];

// Hapa inatosha neno kuwemo ndani ya ujumbe
const ANNOYED_PHRASES = [
  "acha kunisumbua", "unanisumbua", "usinisumbue", "mnanisumbua", "msinisumbue",
  "spam", "stop bothering", "stop messaging", "stop texting", "nitakureport", "nitaripoti",
];

const CONFIRMATIONS = {
  out: "Sawa 👍 Hutapokea tena ujumbe wa ukumbusho kutoka kwetu. Ukihitaji chochote, tuandikie wakati wowote. (Andika START kupokea tena.)",
  in: "Karibu tena! 😊 Nikusaidie nini leo?",
  annoyed: "Samahani sana kwa usumbufu 🙏 Sitakutumia ujumbe tena. Mmiliki wa duka ataangalia mazungumzo haya mwenyewe.",
};

function normalizeText(text) {
  return String(text || "").toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s+/g, " ").trim();
}

/** @returns {"out"|"in"|"annoyed"|null} */
function detectContactPreference(text) {
  const clean = normalizeText(text);
  if (!clean) return null;
  if (OPT_OUT_PHRASES.includes(clean)) return "out";
  if (OPT_IN_PHRASES.includes(clean)) return "in";
  if (ANNOYED_PHRASES.some((p) => clean.includes(p))) return "annoyed";
  return null;
}

/**
 * Hifadhi uamuzi wa mteja kwenye Conversation na CustomerOptIn.
 * @returns {string} ujumbe wa uthibitisho wa kumtumia mteja
 */
async function applyContactPreference({ merchantId, conversationId, customerPhone, preference }) {
  const now = new Date();
  const conversationData = {
    out: { optedOut: true, optedOutAt: now },
    in: { optedOut: false, optedOutAt: null },
    annoyed: { optedOut: true, optedOutAt: now, needsHuman: true, handoverState: "HUMAN_REQUESTED", handoverAt: now },
  }[preference];
  await prisma.conversation.update({ where: { id: conversationId }, data: conversationData });

  const customerWaId = jidToWaId(customerPhone);
  if (customerWaId) {
    const optedIn = preference === "in";
    await prisma.customerOptIn.upsert({
      where: { merchantId_customerWaId: { merchantId, customerWaId } },
      create: {
        merchantId,
        customerWaId,
        marketingOptIn: optedIn,
        optInSource: optedIn ? "whatsapp_keyword" : null,
        optInAt: optedIn ? now : null,
        optedOutAt: optedIn ? null : now,
      },
      update: optedIn
        ? { marketingOptIn: true, optInSource: "whatsapp_keyword", optInAt: now, optedOutAt: null }
        : { marketingOptIn: false, optedOutAt: now },
    });
  }
  return CONFIRMATIONS[preference];
}

module.exports = { detectContactPreference, applyContactPreference, CONFIRMATIONS };
