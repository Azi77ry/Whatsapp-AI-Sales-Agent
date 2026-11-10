// Human takeover: mmiliki anachukua mazungumzo (AI inasimama) au anarudisha kwa AI.
// Hali: AI_ACTIVE | HUMAN_REQUESTED (mteja ameomba) | HUMAN_ACTIVE (mmiliki anajibu) | AI_RESUMED
// needsHuman inabaki kuwa chanzo cha ukweli kwa AI engine (true = AI ikae kimya).

const prisma = require("../db/client");

const AI_STATES = new Set(["AI_ACTIVE", "AI_RESUMED"]);

async function findScoped(merchantId, conversationId) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: parseInt(conversationId, 10), merchantId: parseInt(merchantId, 10) },
  });
  if (!conversation) {
    const err = new Error("Mazungumzo hayapo");
    err.status = 404;
    throw err;
  }
  return conversation;
}

/** Mmiliki anachukua mazungumzo - AI haitajibu tena mpaka arudishe */
async function takeOver(merchantId, conversationId) {
  await findScoped(merchantId, conversationId);
  return prisma.conversation.update({
    where: { id: parseInt(conversationId, 10) },
    data: { needsHuman: true, handoverState: "HUMAN_ACTIVE", handoverAt: new Date() },
  });
}

/** Mmiliki anarudisha mazungumzo kwa AI */
async function resumeAI(merchantId, conversationId) {
  await findScoped(merchantId, conversationId);
  return prisma.conversation.update({
    where: { id: parseInt(conversationId, 10) },
    data: { needsHuman: false, handoverState: "AI_RESUMED", handoverAt: new Date() },
  });
}

/**
 * Je, AI iruhusiwe kutuma jibu SASA HIVI? Inasomwa upya kutoka DB kabla ya kutuma,
 * ili kama mmiliki amechukua mazungumzo wakati AI inafikiri, jibu la AI lisitumwe (hakuna majibu yanayogongana).
 */
async function isMerchantHandling(conversationId) {
  const c = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { handoverState: true } });
  return c?.handoverState === "HUMAN_ACTIVE";
}

module.exports = { takeOver, resumeAI, isMerchantHandling, AI_STATES };
