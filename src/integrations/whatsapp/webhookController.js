// Webhook ya Meta: inathibitisha, inahifadhi matukio kwa kudumu, na kujibu 200 HARAKA.
// Kazi nzito (AI, kutuma) inafanywa na webhookWorker - si ndani ya ombi la Meta.

const prisma = require("../../db/client");
const config = require("../../config");
const logger = require("../../utils/logger");
const { verifySubscription, verifySignature } = require("./webhookVerifier");
const { extractEvents } = require("./messageNormalizer");

function verify(req, res) {
  if (!config.features.cloudApi) return res.sendStatus(404);
  const challenge = verifySubscription(req.query, config.meta.webhookVerifyToken);
  if (challenge === null) {
    logger.warn("webhook.verify.rejected", { mode: req.query["hub.mode"] });
    return res.sendStatus(403);
  }
  res.status(200).type("text/plain").send(challenge);
}

async function receive(req, res) {
  if (!config.features.cloudApi) return res.sendStatus(404);
  if (!config.meta.appSecret) {
    // Bila App Secret hatuwezi kuthibitisha - kataa (Meta itajaribu tena baadaye)
    logger.error("webhook.receive.no_app_secret", {});
    return res.sendStatus(503);
  }
  if (!verifySignature(req.body, req.get("X-Hub-Signature-256"), config.meta.appSecret)) {
    logger.warn("webhook.receive.bad_signature", { ip: req.ip });
    return res.sendStatus(401);
  }

  let body;
  try {
    body = JSON.parse(req.body.toString("utf8"));
  } catch (_) {
    return res.sendStatus(400);
  }

  const events = extractEvents(body);
  if (events.length > 0) {
    try {
      // skipDuplicates: Meta ikituma tukio lilelile tena, halitaingizwa mara ya pili
      await prisma.whatsAppWebhookEvent.createMany({
        data: events.map((e) => ({ dedupeKey: e.dedupeKey, kind: e.kind, phoneNumberId: e.phoneNumberId, payload: e.payload })),
        skipDuplicates: true,
      });
    } catch (err) {
      // Hatukuhifadhi - jibu 500 ili Meta itume tena (tusipoteze ujumbe)
      logger.error("webhook.receive.persist_failed", { error: err.message });
      return res.sendStatus(500);
    }
  }

  res.sendStatus(200);

  if (events.length > 0 && config.features.inProcessWorker) {
    require("../../services/webhookWorker").kick();
  }
}

module.exports = { verify, receive };
