// Worker ya kushughulikia matukio ya webhook yaliyohifadhiwa (foleni ndani ya Postgres - hakuna Redis).
//
// - Inachukua tukio moja kwa wakati kwa UPDATE ... FOR UPDATE SKIP LOCKED (salama hata process nyingi zikiendesha)
// - Kosa la muda -> jaribu tena baadaye (10s, 30s, 2m, 10m, 30m); likizidi -> "dead" (dead-letter)
// - Tukio lililokwama "processing" (process ilikufa) linachukuliwa tena baada ya dakika 5
// - cPanel: inaendeshwa ndani ya app NA/AU na cron (scripts/drain-webhook-queue.js) kila dakika

const prisma = require("../db/client");
const logger = require("../utils/logger");
const tenantResolver = require("./tenantResolver");
const { handleInbound } = require("./messageProcessingService");
const { handleStatus } = require("../integrations/whatsapp/statusHandler");

const BACKOFF_MS = [10e3, 30e3, 120e3, 600e3, 1800e3];
const MAX_ATTEMPTS = BACKOFF_MS.length + 1;
const STALE_LOCK_MINUTES = 5;

// Prisma inahifadhi DateTime kama UTC ("timestamp without time zone"). NOW() AT TIME ZONE 'UTC' inalinganisha
// sawasawa bila kujali TimeZone ya server ya Postgres (vinginevyo retry zingefanyika mapema/kuchelewa kwa saa kadhaa).
async function claimNext() {
  const rows = await prisma.$queryRaw`
    UPDATE "whatsapp_webhook_events"
       SET "status" = 'processing', "lockedAt" = (NOW() AT TIME ZONE 'UTC'), "attempts" = "attempts" + 1
     WHERE "id" = (
       SELECT "id" FROM "whatsapp_webhook_events"
        WHERE ("status" = 'pending' AND "nextAttemptAt" <= (NOW() AT TIME ZONE 'UTC'))
           OR ("status" = 'processing' AND "lockedAt" < (NOW() AT TIME ZONE 'UTC') - (${STALE_LOCK_MINUTES} || ' minutes')::interval)
        ORDER BY "id"
        LIMIT 1
        FOR UPDATE SKIP LOCKED)
    RETURNING *`;
  return rows[0] || null;
}

async function processEvent(event) {
  switch (event.kind) {
    case "message":
      return handleInbound(event.payload);
    case "status": {
      const tenant = await tenantResolver.resolveByPhoneNumberId(event.phoneNumberId);
      if (!tenant) return { outcome: "ignored", reason: "unknown_phone_number_id" };
      return { ...(await handleStatus(event.payload, tenant)), merchantId: tenant.merchantId };
    }
    default:
      if (event.payload?.field === "message_template_status_update") {
        return require("../integrations/whatsapp/templateService").handleTemplateStatusUpdate(event.payload.value || {});
      }
      // account_update, phone_number_quality_update n.k. - zimehifadhiwa kwa ukaguzi
      return { outcome: "recorded" };
  }
}

async function runOne() {
  const event = await claimNext();
  if (!event) return false;

  try {
    const result = (await processEvent(event)) || {};
    await prisma.whatsAppWebhookEvent.update({
      where: { id: event.id },
      data: {
        status: result.outcome === "ignored" ? "ignored" : "done",
        merchantId: result.merchantId ?? event.merchantId,
        lastError: result.reason || null,
        processedAt: new Date(),
        lockedAt: null,
      },
    });
    if (result.outcome === "ignored") logger.warn("webhook.event.ignored", { eventId: event.id, reason: result.reason });
  } catch (err) {
    const retryable = err.retryable !== false && event.attempts < MAX_ATTEMPTS;
    const delay = BACKOFF_MS[Math.min(event.attempts - 1, BACKOFF_MS.length - 1)];
    await prisma.whatsAppWebhookEvent.update({
      where: { id: event.id },
      data: {
        status: retryable ? "pending" : "dead",
        nextAttemptAt: new Date(Date.now() + delay),
        lastError: String(err.message || err).slice(0, 1000),
        lockedAt: null,
      },
    });
    logger[retryable ? "warn" : "error"](retryable ? "webhook.event.retry" : "webhook.event.dead", {
      eventId: event.id, kind: event.kind, attempts: event.attempts, code: err.code, error: err.message,
    });
  }
  return true;
}

let draining = null;

/** Shughulikia matukio yote yaliyo tayari (hadi maxMs). Mwito mmoja tu unaendesha kwa wakati mmoja. */
function drain({ maxMs = 50e3 } = {}) {
  if (draining) return draining;
  draining = (async () => {
    const deadline = Date.now() + maxMs;
    let count = 0;
    try {
      while (Date.now() < deadline && (await runOne())) count += 1;
    } catch (err) {
      logger.error("webhook.worker.error", { error: err.message });
    }
    return count;
  })().finally(() => {
    draining = null;
  });
  return draining;
}

let timer = null;

function kick() {
  setImmediate(() => drain().catch(() => {}));
}

function start({ intervalMs = 5000 } = {}) {
  if (timer) return;
  timer = setInterval(() => drain().catch(() => {}), intervalMs);
  timer.unref?.();
  kick();
  logger.info("webhook.worker.started", { intervalMs });
}

async function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  if (draining) await draining;
}

/** Super Admin: rudisha tukio "dead" kwenye foleni */
async function requeue(eventId) {
  return prisma.whatsAppWebhookEvent.update({
    where: { id: parseInt(eventId, 10) },
    data: { status: "pending", attempts: 0, nextAttemptAt: new Date(), lastError: null },
  });
}

module.exports = { drain, kick, start, stop, requeue, runOne, MAX_ATTEMPTS };
