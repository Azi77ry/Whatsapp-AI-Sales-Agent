// Mteja (client) mwembamba wa Meta Graph API kwa WhatsApp Cloud API.
// Haina business logic - inatuma maombi tu na kuainisha makosa (retryable au la).
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/

const config = require("../../config");

// Makosa ya Graph API ambayo yanaweza kufanikiwa yakijaribiwa tena baadaye
const RETRYABLE_CODES = new Set([
  1, 2, // hitilafu ya muda ya Meta
  4, 80007, // app / WABA rate limit
  130429, // throughput limit
  131048, // spam rate limit
  131056, // pair rate limit (biashara -> mteja mmoja)
  131000, // something went wrong
  133004, // server temporarily unavailable
]);
const TOKEN_ERROR_CODES = new Set([190]);
const OUTSIDE_WINDOW_CODES = new Set([131047]); // zaidi ya saa 24 tangu mteja aandike - template inahitajika

class GraphApiError extends Error {
  constructor({ httpStatus, code, subcode, type, message, fbtraceId, details }) {
    super(message || `Graph API error (HTTP ${httpStatus})`);
    this.name = "GraphApiError";
    this.httpStatus = httpStatus;
    this.code = code;
    this.subcode = subcode;
    this.type = type;
    this.fbtraceId = fbtraceId;
    this.details = details;
    this.isTokenError = TOKEN_ERROR_CODES.has(code);
    this.isOutsideWindow = OUTSIDE_WINDOW_CODES.has(code);
    this.retryable = !this.isTokenError && (httpStatus === 429 || httpStatus >= 500 || RETRYABLE_CODES.has(code));
  }
}

function graphUrl(path) {
  const { graphBaseUrl, graphApiVersion } = config.meta;
  return `${graphBaseUrl.replace(/\/$/, "")}/${graphApiVersion}/${String(path).replace(/^\//, "")}`;
}

async function request(method, path, { token, json, form, query, timeoutMs = 15000 } = {}) {
  const url = new URL(graphUrl(path));
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);

  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  } else if (form) {
    body = form;
  }

  let res;
  try {
    res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    // Mtandao / timeout - jaribu tena baadaye
    const e = new GraphApiError({ httpStatus: 0, message: `Network error: ${err.message}` });
    e.retryable = true;
    throw e;
  }

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_) {
    data = { raw: text.slice(0, 500) };
  }

  if (!res.ok || data.error) {
    const err = data.error || {};
    throw new GraphApiError({
      httpStatus: res.status,
      code: err.code,
      subcode: err.error_subcode,
      type: err.type,
      message: err.error_user_msg || err.message,
      fbtraceId: err.fbtrace_id,
      details: err.error_data,
    });
  }
  return data;
}

/** Tuma ujumbe wowote (text, image, audio, template, ...) - inarudisha wamid */
async function sendMessage({ phoneNumberId, token, payload }) {
  const data = await request("POST", `${phoneNumberId}/messages`, {
    token,
    json: { messaging_product: "whatsapp", recipient_type: "individual", ...payload },
  });
  return { messageId: data.messages?.[0]?.id || null, raw: data };
}

/** Weka ujumbe kama umesomwa na (hiari) onyesha "typing..." kwa mteja */
async function markRead({ phoneNumberId, token, messageId, typing = false }) {
  const json = { messaging_product: "whatsapp", status: "read", message_id: messageId };
  if (typing) json.typing_indicator = { type: "text" };
  return request("POST", `${phoneNumberId}/messages`, { token, json });
}

/** Pata URL ya muda ya media (inahitaji token kuipakua) */
async function getMediaInfo({ mediaId, token }) {
  return request("GET", mediaId, { token }); // { url, mime_type, sha256, file_size, id }
}

/** Pakua media kutoka URL ya Meta (lazima Authorization header) */
async function downloadMedia({ url, token, maxBytes = 16 * 1024 * 1024 }) {
  const { graphBaseUrl } = config.meta;
  const allowedHosts = [new URL(graphBaseUrl).hostname, "lookaside.fbsbx.com"];
  const host = new URL(url).hostname;
  // 🛡️ Usitume token kwa host isiyo ya Meta (kuzuia SSRF / kuvuja kwa token)
  if (!allowedHosts.includes(host) && !host.endsWith(".fbcdn.net") && !host.endsWith(".whatsapp.net")) {
    throw new GraphApiError({ httpStatus: 0, message: `Media host hairuhusiwi: ${host}` });
  }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new GraphApiError({ httpStatus: res.status, message: "Imeshindwa kupakua media" });
  const len = Number(res.headers.get("content-length") || 0);
  if (len > maxBytes) throw new GraphApiError({ httpStatus: 413, message: "Media ni kubwa mno" });
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new GraphApiError({ httpStatus: 413, message: "Media ni kubwa mno" });
  return { buffer: buf, mimeType: res.headers.get("content-type") || "application/octet-stream" };
}

/** Pakia media (mf. sauti ya jibu) ili kupata media id ya kutuma */
async function uploadMedia({ phoneNumberId, token, buffer, mimeType, filename = "file" }) {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimeType);
  form.append("file", new Blob([buffer], { type: mimeType }), filename);
  const data = await request("POST", `${phoneNumberId}/media`, { token, form, timeoutMs: 60000 });
  return { mediaId: data.id };
}

/** Taarifa za namba (jina lililothibitishwa, ubora, kikomo cha ujumbe) */
async function getPhoneNumber({ phoneNumberId, token }) {
  return request("GET", phoneNumberId, {
    token,
    query: { fields: "display_phone_number,verified_name,quality_rating,messaging_limit_tier,status" },
  });
}

module.exports = {
  GraphApiError,
  request,
  sendMessage,
  markRead,
  getMediaInfo,
  downloadMedia,
  uploadMedia,
  getPhoneNumber,
  graphUrl,
};
