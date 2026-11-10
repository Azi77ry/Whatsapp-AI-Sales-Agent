// Wajenzi wa payload za webhook za Meta (umbo kama la docs za Cloud API) na mock ya Graph API.

const crypto = require("node:crypto");
const http = require("node:http");

let seq = 0;
const wamid = (tag = "x") => `wamid.TEST${tag}${Date.now()}${++seq}`;

function envelope(phoneNumberId, value, { wabaId = "WABA_TEST", field = "messages" } = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: wabaId,
      changes: [{
        field,
        value: {
          messaging_product: "whatsapp",
          metadata: { display_phone_number: "255700000000", phone_number_id: phoneNumberId },
          ...value,
        },
      }],
    }],
  };
}

function inbound(phoneNumberId, message, { from = "255712345678", name = "Juma" } = {}) {
  return envelope(phoneNumberId, {
    contacts: [{ profile: { name }, wa_id: from }],
    messages: [{ from, id: wamid(message.type), timestamp: String(Math.floor(Date.now() / 1000)), ...message }],
  });
}

const textMessage = (phoneNumberId, body, opts) => inbound(phoneNumberId, { type: "text", text: { body } }, opts);
const imageMessage = (phoneNumberId, caption, opts) =>
  inbound(phoneNumberId, { type: "image", image: { id: "MEDIA_IMG_1", mime_type: "image/jpeg", sha256: "abc", caption } }, opts);
const audioMessage = (phoneNumberId, opts) =>
  inbound(phoneNumberId, { type: "audio", audio: { id: "MEDIA_AUDIO_1", mime_type: "audio/ogg; codecs=opus", voice: true } }, opts);

function statusUpdate(phoneNumberId, messageId, status, { errors } = {}) {
  return envelope(phoneNumberId, {
    statuses: [{
      id: messageId,
      status,
      timestamp: String(Math.floor(Date.now() / 1000)),
      recipient_id: "255712345678",
      ...(errors ? { errors } : {}),
      pricing: { billable: false, category: "service", pricing_model: "PMP" },
    }],
  });
}

function sign(rawBody, appSecret) {
  return "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
}

/**
 * Mock ya Graph API kwenye localhost. Inarekodi kila ombi; jibu linaweza kubadilishwa kwa handler.
 *   const graph = await startGraphMock();  process.env.META_GRAPH_BASE_URL = graph.url
 */
async function startGraphMock() {
  const calls = [];
  let handler = defaultHandler;

  function defaultHandler(req, body) {
    if (req.method === "POST" && /\/messages$/.test(req.url)) {
      if (body.status === "read") return { status: 200, json: { success: true } };
      return { status: 200, json: { messaging_product: "whatsapp", messages: [{ id: wamid("out") }] } };
    }
    if (req.method === "POST" && /\/media$/.test(req.url)) return { status: 200, json: { id: "UPLOADED_MEDIA_1" } };
    if (req.method === "GET" && /MEDIA_/.test(req.url)) {
      return { status: 200, json: { url: `${server.url}/download/${req.url.split("/").pop()}`, mime_type: "audio/ogg" } };
    }
    if (req.method === "GET" && /\/download\//.test(req.url)) return { status: 200, raw: Buffer.from("fake-audio-bytes"), type: "audio/ogg" };
    return { status: 404, json: { error: { message: "not mocked", code: 100 } } };
  }

  const srv = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const rawBody = Buffer.concat(chunks);
      let body = {};
      if ((req.headers["content-type"] || "").includes("application/json")) {
        try { body = JSON.parse(rawBody.toString()); } catch (_) {}
      }
      calls.push({ method: req.method, url: req.url, headers: req.headers, body, rawBody });
      const out = handler(req, body, defaultHandler) || defaultHandler(req, body);
      res.statusCode = out.status;
      if (out.raw) {
        res.setHeader("Content-Type", out.type || "application/octet-stream");
        res.end(out.raw);
      } else {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(out.json));
      }
    });
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));

  const server = {
    url: `http://127.0.0.1:${srv.address().port}`,
    calls,
    sentMessages: () => calls.filter((c) => c.method === "POST" && /\/messages$/.test(c.url) && c.body.status !== "read"),
    setHandler: (fn) => { handler = fn; },
    reset: () => { calls.length = 0; handler = defaultHandler; },
    close: () => new Promise((r) => srv.close(r)),
  };
  return server;
}

module.exports = { wamid, envelope, textMessage, imageMessage, audioMessage, statusUpdate, sign, startGraphMock };
