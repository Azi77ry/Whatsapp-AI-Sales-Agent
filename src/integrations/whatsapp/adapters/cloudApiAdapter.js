// Transport ya Meta WhatsApp Cloud API.
// Kiolesura (interface) sawa na adapter nyingine: inapokea muunganiko + ujumbe wa ndani,
// inarudisha { providerMessageId }. Haina business logic (AI, oda, dirisha la saa 24, n.k.).

const cloudApi = require("../cloudApiClient");
const tokenService = require("../tokenService");

async function withToken(connection, fn) {
  const token = await tokenService.getAccessToken(connection.accountId);
  try {
    return await fn(token);
  } catch (err) {
    if (err.isTokenError) await tokenService.markInvalid(connection.accountId, "rejected_by_meta");
    throw err;
  }
}

/**
 * @param {object} connection - WhatsAppPhoneNumber (yenye accountId na phoneNumberId)
 * @param {object} msg
 *   { to, type: "text", text }
 *   { to, type: "image", image: { buffer, mimeType, filename } | { link }, caption }
 *   { to, type: "audio", audio: { buffer, mimeType } }
 *   { to, type: "template", template: { name, language, components } }
 *   replyToProviderId (hiari) - jibu kama "reply" ya ujumbe huo
 */
async function send(connection, msg) {
  return withToken(connection, async (token) => {
    const base = { to: msg.to };
    if (msg.replyToProviderId) base.context = { message_id: msg.replyToProviderId };

    let payload;
    switch (msg.type) {
      case "text":
        payload = { ...base, type: "text", text: { body: msg.text, preview_url: false } };
        break;
      case "image": {
        const image = msg.image.link
          ? { link: msg.image.link }
          : { id: (await cloudApi.uploadMedia({ phoneNumberId: connection.phoneNumberId, token, ...msg.image })).mediaId };
        if (msg.caption) image.caption = msg.caption;
        payload = { ...base, type: "image", image };
        break;
      }
      case "audio": {
        const { mediaId } = await cloudApi.uploadMedia({
          phoneNumberId: connection.phoneNumberId, token, buffer: msg.audio.buffer, mimeType: msg.audio.mimeType, filename: "reply.mp3",
        });
        payload = { ...base, type: "audio", audio: { id: mediaId } };
        break;
      }
      case "template":
        payload = {
          ...base,
          type: "template",
          template: { name: msg.template.name, language: { code: msg.template.language }, components: msg.template.components || [] },
        };
        break;
      default:
        throw new Error(`Aina ya ujumbe haijulikani: ${msg.type}`);
    }

    const { messageId } = await cloudApi.sendMessage({ phoneNumberId: connection.phoneNumberId, token, payload });
    return { providerMessageId: messageId };
  });
}

/** Weka "umesomwa" + onyesha typing (best effort - kosa hapa halizuii jibu) */
async function markRead(connection, providerMessageId, { typing = true } = {}) {
  return withToken(connection, (token) =>
    cloudApi.markRead({ phoneNumberId: connection.phoneNumberId, token, messageId: providerMessageId, typing })
  );
}

async function downloadMedia(connection, mediaId) {
  const { downloadInboundMedia } = require("../mediaHandler");
  return withToken(connection, (token) => downloadInboundMedia({ mediaId, token }));
}

module.exports = { name: "cloud_api", send, markRead, downloadMedia };
