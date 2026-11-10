// Media kwa Cloud API: kupakua media ya mteja, na kuandaa picha za bidhaa / sauti za kutuma.

const fs = require("fs");
const path = require("path");
const cloudApi = require("./cloudApiClient");

const UPLOADS_ROOT = path.resolve(__dirname, "../../../public/uploads");
const EXT_MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };

/** Pakua media ya ujumbe wa mteja (voice note, picha) */
async function downloadInboundMedia({ mediaId, token }) {
  const info = await cloudApi.getMediaInfo({ mediaId, token });
  if (!info?.url) throw new Error("Meta haikurudisha URL ya media");
  const file = await cloudApi.downloadMedia({ url: info.url, token });
  return { buffer: file.buffer, mimeType: (info.mime_type || file.mimeType || "").split(";")[0].trim() };
}

/**
 * Tenganisha tag ya [IMAGE: url] ambayo AI inaweka kwenye jibu (kama ilivyo kwenye V1)
 * @returns {{ cleanText: string, imageRef: string|null }}
 */
function parseImageTag(text) {
  const match = String(text || "").match(/\[IMAGE:\s*(.+?)\]/i);
  if (!match) return { cleanText: text, imageRef: null };
  return { cleanText: text.replace(match[0], "").trim(), imageRef: match[1].trim() };
}

/**
 * Picha ya kutuma: faili la ndani (/uploads/...) -> buffer ya kupakia kwa Meta; URL ya nje -> link.
 * 🛡️ Njia ya ndani inazuiwa isitoke nje ya public/uploads (path traversal).
 */
function resolveOutboundImage(imageRef) {
  const idx = imageRef.indexOf("/uploads/");
  if (idx !== -1) {
    const rel = imageRef.substring(idx + "/uploads/".length).split("?")[0];
    const localPath = path.resolve(UPLOADS_ROOT, rel);
    if (localPath.startsWith(UPLOADS_ROOT + path.sep) && fs.existsSync(localPath)) {
      const mimeType = EXT_MIME[path.extname(localPath).toLowerCase()];
      if (mimeType) return { buffer: fs.readFileSync(localPath), mimeType, filename: path.basename(localPath) };
    }
  }
  if (/^https:\/\//i.test(imageRef)) return { link: imageRef };
  return null; // haiwezi kutumwa (mf. http isiyo salama au faili halipo) - tutatuma maandishi tu
}

module.exports = { downloadInboundMedia, parseImageTag, resolveOutboundImage };
