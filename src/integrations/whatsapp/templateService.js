// Templates za WhatsApp (zinahitajika kutuma ujumbe NJE ya dirisha la saa 24).
// - Sync kutoka Meta, kufuatilia idhini (webhook message_template_status_update)
// - Merchant anachagua template ipi itumike kwa kusudi gani (purpose)
// - Kutuma: template lazima iwe APPROVED, ya WABA ya merchant huyo; MARKETING inahitaji ridhaa (opt-in)

const prisma = require("../../db/client");
const cloudApi = require("./cloudApiClient");
const tokenService = require("./tokenService");
const cloudAdapter = require("./adapters/cloudApiAdapter");
const logger = require("../../utils/logger");

// Aina ya ujumbe ndani ya mfumo -> kusudi la template linalotumika nje ya saa 24
const PURPOSE_BY_KIND = { transactional: "order_update", marketing: "reengagement", otp: "otp" };
const PURPOSES = ["order_update", "special_request", "reengagement", "otp"];

async function syncTemplates(merchantId) {
  const accounts = await prisma.whatsAppAccount.findMany({ where: { merchantId: parseInt(merchantId, 10), status: "active" } });
  let count = 0;
  for (const account of accounts) {
    const token = await tokenService.getAccessToken(account.id);
    let after = null;
    do {
      const query = { fields: "id,name,language,status,category,components,rejected_reason", limit: "100" };
      if (after) query.after = after;
      const page = await cloudApi.request("GET", `${account.wabaId}/message_templates`, { token, query });
      for (const t of page.data || []) {
        await prisma.whatsAppTemplate.upsert({
          where: { accountId_name_language: { accountId: account.id, name: t.name, language: t.language } },
          create: {
            accountId: account.id, name: t.name, language: t.language, category: t.category, status: t.status,
            metaTemplateId: t.id, components: t.components || null, rejectedReason: t.rejected_reason || null,
          },
          update: { category: t.category, status: t.status, metaTemplateId: t.id, components: t.components || null, rejectedReason: t.rejected_reason || null },
        });
        count += 1;
      }
      after = page.paging?.next ? page.paging?.cursors?.after : null;
    } while (after);
  }
  return { synced: count };
}

async function listForMerchant(merchantId) {
  return prisma.whatsAppTemplate.findMany({
    where: { account: { merchantId: parseInt(merchantId, 10) } },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
}

/** Weka kusudi la template (scoped kwa merchant). Template moja tu kwa kusudi moja. */
async function setPurpose(merchantId, templateId, purpose) {
  if (purpose !== null && !PURPOSES.includes(purpose)) {
    const err = new Error("Kusudi si sahihi");
    err.status = 400;
    throw err;
  }
  const template = await prisma.whatsAppTemplate.findFirst({
    where: { id: parseInt(templateId, 10), account: { merchantId: parseInt(merchantId, 10) } },
  });
  if (!template) {
    const err = new Error("Template haipo");
    err.status = 404;
    throw err;
  }
  if (purpose) {
    await prisma.whatsAppTemplate.updateMany({
      where: { account: { merchantId: parseInt(merchantId, 10) }, purpose, NOT: { id: template.id } },
      data: { purpose: null },
    });
  }
  return prisma.whatsAppTemplate.update({ where: { id: template.id }, data: { purpose } });
}

/** Webhook: Meta imeidhinisha / kukataa / kusimamisha template */
async function handleTemplateStatusUpdate(value) {
  const where = value.message_template_id
    ? { metaTemplateId: String(value.message_template_id) }
    : { name: value.message_template_name, language: value.message_template_language };
  const result = await prisma.whatsAppTemplate.updateMany({
    where,
    data: { status: value.event, rejectedReason: value.reason && value.reason !== "NONE" ? value.reason : null },
  });
  return { outcome: result.count > 0 ? "updated" : "unknown_template" };
}

/**
 * Tafuta template iliyoidhinishwa kwa aina hii ya ujumbe (nje ya saa 24)
 */
async function findApprovedForKind(connection, kind) {
  const purpose = PURPOSE_BY_KIND[kind];
  if (!purpose || !connection.accountId) return null;
  return prisma.whatsAppTemplate.findFirst({ where: { accountId: connection.accountId, purpose, status: "APPROVED" } });
}

/**
 * Tuma template. Maandishi ya mfumo yanawekwa kama kigezo {{1}} cha body (template iwe na kigezo kimoja cha body).
 */
async function sendTemplateText({ connection, template, merchantId, waId, text }) {
  if (template.category === "MARKETING") {
    const optIn = await prisma.customerOptIn.findUnique({
      where: { merchantId_customerWaId: { merchantId: parseInt(merchantId, 10), customerWaId: waId } },
    });
    // 🛡️ Marketing nje ya saa 24 inahitaji ridhaa ya wazi ya mteja
    if (!optIn?.marketingOptIn || optIn.optedOutAt) return { sent: false, reason: "no_marketing_opt_in" };
  }
  const body = String(text).replace(/\s*\n+\s*/g, " ").slice(0, 1000); // vigezo vya template haviruhusu mistari mipya
  const { providerMessageId } = await cloudAdapter.send(connection, {
    to: waId,
    type: "template",
    template: { name: template.name, language: template.language, components: [{ type: "body", parameters: [{ type: "text", text: body }] }] },
  });
  logger.info("whatsapp.template.sent", { merchantId, template: template.name });
  return { sent: true, providerMessageId, template: template.name };
}

module.exports = { syncTemplates, listForMerchant, setPurpose, handleTemplateStatusUpdate, findApprovedForKind, sendTemplateText, PURPOSES };
