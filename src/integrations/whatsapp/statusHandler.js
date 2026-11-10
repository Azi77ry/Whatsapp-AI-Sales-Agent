// Hali za ujumbe uliotumwa (sent -> delivered -> read, au failed) kutoka kwa webhook za Meta.

const prisma = require("../../db/client");

// Hali haipaswi kurudi nyuma (Meta inaweza kutuma "delivered" baada ya "read")
const RANK = { queued: 0, sent: 1, delivered: 2, read: 3 };

/**
 * @param {object} status - kutoka messageNormalizer.normalizeStatus
 * @param {object|null} tenant - kutoka tenantResolver (kwa kutenganisha merchants)
 */
async function handleStatus(status, tenant) {
  const firstError = status.errors?.[0] || null;

  await prisma.whatsAppMessageStatus.createMany({
    data: [{
      providerMessageId: status.providerMessageId,
      status: status.status,
      errorCode: firstError?.code != null ? String(firstError.code) : null,
      errorTitle: firstError?.title || firstError?.message || null,
      recipientWaId: status.recipientWaId,
      pricingCategory: status.pricingCategory,
      occurredAt: new Date(status.timestamp || Date.now()),
    }],
    skipDuplicates: true,
  });

  const message = await prisma.message.findUnique({ where: { providerMessageId: status.providerMessageId } });
  if (!message) return { outcome: "recorded_only" }; // mf. ujumbe uliotumwa kutoka simu (coexistence)

  // 🛡️ Hali ya namba ya merchant mmoja haiwezi kubadilisha ujumbe wa merchant mwingine
  if (tenant && message.phoneNumberId && message.phoneNumberId !== tenant.phone.id) {
    return { outcome: "ignored", reason: "tenant_mismatch" };
  }

  const isFailure = status.status === "failed";
  const newer = (RANK[status.status] ?? -1) > (RANK[message.status] ?? -1);
  if (!isFailure && !newer) return { outcome: "stale" };

  await prisma.message.update({
    where: { id: message.id },
    data: {
      status: status.status,
      statusUpdatedAt: new Date(status.timestamp || Date.now()),
      errorCode: isFailure && firstError?.code != null ? String(firstError.code) : message.errorCode,
    },
  });
  return { outcome: "updated" };
}

module.exports = { handleStatus };
