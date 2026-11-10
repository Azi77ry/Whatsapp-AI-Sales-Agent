// Inabadilisha payload ya webhook ya Meta kuwa matukio (events) ya ndani yasiyotegemea provider.
// Kila tukio lina dedupeKey ili Meta ikituma tukio lilelile mara mbili tusilishughulikie mara mbili.

const crypto = require("crypto");

function textOf(m) {
  switch (m.type) {
    case "text":
      return m.text?.body || null;
    case "image":
    case "video":
    case "document":
      return m[m.type]?.caption || null;
    case "button":
      return m.button?.text || m.button?.payload || null;
    case "interactive":
      return m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || null;
    case "location": {
      const l = m.location || {};
      return `[Location: ${l.name ? l.name + " " : ""}${l.latitude},${l.longitude}]`;
    }
    case "reaction":
      return m.reaction?.emoji || null;
    default:
      return null;
  }
}

function mediaOf(m) {
  const media = ["image", "audio", "video", "document", "sticker"].includes(m.type) ? m[m.type] : null;
  if (!media?.id) return null;
  return {
    id: media.id,
    mimeType: media.mime_type || null,
    caption: media.caption || null,
    filename: media.filename || null,
    voice: Boolean(media.voice),
  };
}

/**
 * Ujumbe mmoja wa mteja -> InboundMessage ya ndani
 */
function normalizeMessage(m, value, wabaId) {
  const contact = (value.contacts || []).find((c) => c.wa_id === m.from) || value.contacts?.[0];
  return {
    provider: "cloud_api",
    wabaId,
    phoneNumberId: value.metadata?.phone_number_id || null,
    displayPhoneNumber: value.metadata?.display_phone_number || null,
    providerMessageId: m.id,
    from: m.from,
    customerName: contact?.profile?.name || null,
    timestamp: Number(m.timestamp) * 1000,
    type: m.type,
    text: textOf(m),
    media: mediaOf(m),
    contextMessageId: m.context?.id || null,
    errors: m.errors || null,
  };
}

function normalizeStatus(s, value) {
  return {
    phoneNumberId: value.metadata?.phone_number_id || null,
    providerMessageId: s.id,
    status: s.status, // sent | delivered | read | failed
    timestamp: Number(s.timestamp) * 1000,
    recipientWaId: s.recipient_id || null,
    pricingCategory: s.pricing?.category || s.conversation?.origin?.type || null,
    errors: (s.errors || []).map((e) => ({ code: e.code, title: e.title, message: e.message || e.error_data?.details })),
  };
}

/**
 * @param {object} body - JSON ya webhook ya Meta
 * @returns {Array<{dedupeKey, kind, phoneNumberId, payload}>}
 */
function extractEvents(body) {
  const events = [];
  if (!body || body.object !== "whatsapp_business_account" || !Array.isArray(body.entry)) return events;

  for (const entry of body.entry) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const phoneNumberId = value.metadata?.phone_number_id || null;

      if (change.field === "messages") {
        for (const m of value.messages || []) {
          if (!m?.id) continue;
          events.push({
            dedupeKey: `msg:${m.id}`,
            kind: "message",
            phoneNumberId,
            payload: normalizeMessage(m, value, entry.id),
          });
        }
        for (const s of value.statuses || []) {
          if (!s?.id || !s.status) continue;
          events.push({
            dedupeKey: `status:${s.id}:${s.status}`,
            kind: "status",
            phoneNumberId,
            payload: normalizeStatus(s, value),
          });
        }
        if ((value.messages || []).length === 0 && (value.statuses || []).length === 0 && value.errors) {
          events.push(otherEvent(entry, change, phoneNumberId));
        }
      } else {
        // account_update, message_template_status_update, phone_number_quality_update, ...
        events.push(otherEvent(entry, change, phoneNumberId));
      }
    }
  }
  return events;
}

function otherEvent(entry, change, phoneNumberId) {
  const hash = crypto.createHash("sha256").update(JSON.stringify({ id: entry.id, change })).digest("hex").slice(0, 40);
  return {
    dedupeKey: `other:${change.field}:${hash}`,
    kind: "other",
    phoneNumberId,
    payload: { field: change.field, wabaId: entry.id, value: change.value },
  };
}

/** wa_id (tarakimu) <-> JID ya ndani tunayotumia kama Conversation.customerPhone (inalingana na Baileys) */
const waIdToJid = (waId) => `${String(waId).replace(/\D/g, "")}@s.whatsapp.net`;
const jidToWaId = (jid) => (String(jid).endsWith("@s.whatsapp.net") ? String(jid).split("@")[0].split(":")[0] : null);

module.exports = { extractEvents, normalizeMessage, normalizeStatus, waIdToJid, jidToWaId };
