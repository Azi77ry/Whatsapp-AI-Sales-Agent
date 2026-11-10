// End-to-end: Meta webhook -> DB queue -> worker -> AI engine (fake model, tools halisi) -> Graph API (mock)
process.env.FEATURE_CLOUD_API = "true";
process.env.WEBHOOK_WORKER_IN_PROCESS = "false"; // tests zinaendesha worker zenyewe (deterministic)
const { startApp, tokenFor, createMerchant } = require("./helpers/setup");
process.env.TOKEN_ENCRYPTION_KEY = require("node:crypto").randomBytes(32).toString("base64");

const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert");
const meta = require("./helpers/meta");

// ── Fake AI model: inaita tools HALISI (search_products, create_order) kama model ingefanya ──
const aiCalls = [];
let onAiCall = null;
const fakeProvider = {
  name: "fake",
  isConfigured: () => true,
  async getReply(history, userMessage, context) {
    const { executeTool } = require("../src/ai/tools");
    aiCalls.push({ userMessage, merchantId: context.merchantId });
    if (onAiCall) await onAiCall(context);
    if (/kuagiza/i.test(userMessage)) {
      const r = await executeTool("create_order", { customerName: "Juma", productName: "Jezi", quantity: 1, deliveryType: "pickup" }, context);
      return `Oda #${r.orderId} imepokelewa ✅`;
    }
    if (/bei/i.test(userMessage)) {
      const r = await executeTool("search_products", { query: "Jezi" }, context);
      return r.found ? r.products.map((p) => `${p.name}: TZS ${p.price}`).join(", ") : "Hatuna jezi kwa sasa";
    }
    return "Karibu! Nikusaidie nini?";
  },
};
require("../src/ai/providers").getOrderedProviders = () => [fakeProvider];

// Sauti: STT/TTS za uongo (hakuna mtandao)
const voice = require("../src/ai/voiceService");
voice.speechToText = async (buf) => (buf.toString() === "fake-audio-bytes" ? "Bei ya jezi?" : null);
voice.textToSpeech = async () => Buffer.from("fake-mp3");

let app, graph, prisma, config, worker, connectionService, messageSender;
let seq = 0;

before(async () => {
  graph = await meta.startGraphMock();
  config = require("../src/config");
  config.meta.graphBaseUrl = graph.url;
  config.meta.appSecret = "test-app-secret";
  config.meta.webhookVerifyToken = "verify-me";
  app = await startApp();
  prisma = require("../src/db/client");
  worker = require("../src/services/webhookWorker");
  connectionService = require("../src/integrations/whatsapp/connectionService");
  messageSender = require("../src/integrations/whatsapp/messageSender");
});

after(async () => {
  await app.close();
  await graph.close();
  await prisma.$disconnect();
});

beforeEach(() => {
  graph.reset();
  graph.setHandler(phoneLookupHandler);
  aiCalls.length = 0;
  onAiCall = null;
});

// GET /<version>/PN_<digits> -> taarifa za namba (inatumika wakati wa kuunganisha)
function phoneLookupHandler(req, body, next) {
  const m = req.method === "GET" && req.url.match(/\/(PN_(\d+))\?/);
  if (m) return { status: 200, json: { display_phone_number: `+${m[2]}`, verified_name: "Test Shop", quality_rating: "GREEN" } };
  return next(req, body);
}

/** Merchant mpya + namba ya Cloud API iliyounganishwa + bidhaa yake */
async function setupMerchant({ product = { name: "Jezi ya Simba", price: 35000 }, merchantData = {} } = {}) {
  seq += 1;
  const merchant = await createMerchant(prisma, merchantData);
  const digits = `2557${String(Date.now()).slice(-6)}${seq}`;
  const phoneNumberId = `PN_${digits}`;
  const connection = await connectionService.connect({
    merchantId: merchant.id, wabaId: `WABA_${digits}`, phoneNumberId, accessToken: `EAAG-secret-${digits}`,
  });
  if (product) {
    await prisma.product.create({ data: { merchantId: merchant.id, category: "Jezi", stock: 10, ...product } });
  }
  return { merchant, phoneNumberId, connection };
}

/** Mazungumzo yaliyokwisha kubali AI (ili jaribio liende moja kwa moja kwenye AI) */
async function consentedCustomer(merchantId, { lastInboundAt = new Date() } = {}) {
  seq += 1;
  const waId = `2556${String(Date.now()).slice(-7)}${seq}`;
  const conversation = await prisma.conversation.create({
    data: { merchantId, customerPhone: `${waId}@s.whatsapp.net`, customerWaId: waId, consentGiven: true, lastInboundAt },
  });
  return { waId, conversation };
}

async function postWebhook(body, { secret = "test-app-secret", signature } = {}) {
  const raw = Buffer.from(JSON.stringify(body));
  return fetch(`${app.url}/webhooks/whatsapp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Hub-Signature-256": signature ?? meta.sign(raw, secret) },
    body: raw,
  });
}

async function deliver(body) {
  const res = await postWebhook(body);
  assert.strictEqual(res.status, 200);
  await worker.drain();
}

const sentTexts = () => graph.sentMessages().map((c) => c.body.text?.body || c.body.image?.caption || c.body.type);

// ─────────────────────────────────────────────────────────────────────────────

test("GET /webhooks/whatsapp verifies the Meta subscription", async () => {
  const ok = await fetch(`${app.url}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=CH4LL3NGE`);
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(await ok.text(), "CH4LL3NGE");
  const bad = await fetch(`${app.url}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=x`);
  assert.strictEqual(bad.status, 403);
});

test("POST with an invalid signature is rejected and nothing is stored", async () => {
  const body = meta.textMessage("PN_ANY", "habari");
  const before = await prisma.whatsAppWebhookEvent.count();
  assert.strictEqual((await postWebhook(body, { secret: "attacker-secret" })).status, 401);
  assert.strictEqual((await postWebhook(body, { signature: "" })).status, 401);
  assert.strictEqual(await prisma.whatsAppWebhookEvent.count(), before);
});

test("unknown phone_number_id is stored, marked ignored, and never answered", async () => {
  const body = meta.textMessage("PN_UNKNOWN_999", "habari");
  await deliver(body);
  const event = await prisma.whatsAppWebhookEvent.findFirst({ where: { phoneNumberId: "PN_UNKNOWN_999" }, orderBy: { id: "desc" } });
  assert.strictEqual(event.status, "ignored");
  assert.strictEqual(event.lastError, "unknown_phone_number_id");
  assert.strictEqual(graph.sentMessages().length, 0);
  assert.strictEqual(aiCalls.length, 0);
});

test("text message: routed to the right merchant, AI uses ONLY that merchant's products, reply sent and saved", async () => {
  const a = await setupMerchant({ product: { name: "Jezi ya Simba", price: 35000 } });
  await setupMerchant({ product: { name: "Jezi ya Yanga", price: 99999 } }); // merchant mwingine
  const { waId, conversation } = await consentedCustomer(a.merchant.id);

  await deliver(meta.textMessage(a.phoneNumberId, "Bei ya jezi?", { from: waId }));

  assert.deepStrictEqual(aiCalls.map((c) => c.merchantId), [a.merchant.id]);
  const sends = graph.sentMessages();
  assert.strictEqual(sends.length, 1);
  assert.match(sends[0].url, new RegExp(`/${a.phoneNumberId}/messages$`), "sent from merchant A's number");
  assert.strictEqual(sends[0].body.to, waId);
  assert.match(sends[0].body.text.body, /Jezi ya Simba: TZS 35000/);
  assert.doesNotMatch(sends[0].body.text.body, /Yanga/, "never leaks another merchant's products");
  assert.strictEqual(sends[0].headers.authorization, `Bearer EAAG-secret-${a.phoneNumberId.slice(3)}`);

  const msgs = await prisma.message.findMany({ where: { conversationId: conversation.id }, orderBy: { id: "asc" } });
  assert.deepStrictEqual(msgs.map((m) => [m.sender, m.direction, m.status]), [["customer", "inbound", null], ["ai", "outbound", "sent"]]);
  assert.match(msgs[1].providerMessageId, /^wamid\./);
  assert.match(msgs[0].content, /^v2:/, "stored encrypted with GCM");
  const conv = await prisma.conversation.findUnique({ where: { id: conversation.id } });
  assert.ok(conv.lastInboundAt > new Date(Date.now() - 60e3), "24h window starts from this message");

  const read = graph.calls.find((c) => c.body.status === "read");
  assert.ok(read, "message marked as read");
});

test("first contact: existing consent flow (1/2) still works over Cloud API", async () => {
  const a = await setupMerchant();
  const waId = `25569${Date.now() % 1e7}`;
  await deliver(meta.textMessage(a.phoneNumberId, "Habari", { from: waId }));
  assert.match(sentTexts()[0], /1️⃣ - Kuendelea na AI/);
  await deliver(meta.textMessage(a.phoneNumberId, "1", { from: waId }));
  assert.match(sentTexts()[1], /Asante kwa kuchagua/);
  assert.strictEqual(aiCalls.length, 0, "AI model is not called during consent");
});

test("order creation through the AI tool is saved under the right merchant and conversation", async () => {
  const a = await setupMerchant();
  const { waId, conversation } = await consentedCustomer(a.merchant.id);
  await deliver(meta.textMessage(a.phoneNumberId, "Nataka kuagiza jezi moja", { from: waId }));
  const order = await prisma.order.findFirst({ where: { conversationId: conversation.id } });
  assert.ok(order);
  assert.strictEqual(order.merchantId, a.merchant.id);
  assert.strictEqual(order.productName, "Jezi ya Simba");
  assert.match(sentTexts()[0], new RegExp(`Oda #${order.id}`));
});

test("duplicate webhook delivery is processed once", async () => {
  const a = await setupMerchant();
  const { waId } = await consentedCustomer(a.merchant.id);
  const body = meta.textMessage(a.phoneNumberId, "Bei ya jezi?", { from: waId });
  await postWebhook(body);
  await postWebhook(body);
  await worker.drain();
  await deliver(body);
  assert.strictEqual(aiCalls.length, 1);
  assert.strictEqual(graph.sentMessages().length, 1);
});

test("image with caption reaches the AI; image without caption is only logged", async () => {
  const a = await setupMerchant();
  const { waId, conversation } = await consentedCustomer(a.merchant.id);
  await deliver(meta.imageMessage(a.phoneNumberId, "Bei ya jezi hii?", { from: waId }));
  assert.strictEqual(aiCalls.length, 1);
  await deliver(meta.imageMessage(a.phoneNumberId, undefined, { from: waId }));
  assert.strictEqual(aiCalls.length, 1, "no AI call for a bare image");
  const last = await prisma.message.findFirst({ where: { conversationId: conversation.id }, orderBy: { id: "desc" } });
  assert.strictEqual(last.type, "image");
});

test("voice note: downloaded with the merchant token, transcribed, answered with a voice reply", async () => {
  const a = await setupMerchant();
  const { waId } = await consentedCustomer(a.merchant.id);
  await deliver(meta.audioMessage(a.phoneNumberId, { from: waId }));
  assert.strictEqual(aiCalls[0].userMessage, "Bei ya jezi?");
  const download = graph.calls.find((c) => c.url.includes("/download/"));
  assert.ok(download.headers.authorization.startsWith("Bearer EAAG-secret-"));
  assert.ok(graph.calls.some((c) => c.method === "POST" && c.url.endsWith("/media")), "TTS audio uploaded");
  assert.strictEqual(graph.sentMessages()[0].body.type, "audio");
});

test("delivery statuses update the message and never go backwards", async () => {
  const a = await setupMerchant();
  const { waId } = await consentedCustomer(a.merchant.id);
  await deliver(meta.textMessage(a.phoneNumberId, "habari", { from: waId }));
  const reply = await prisma.message.findFirst({ where: { direction: "outbound", phoneNumberId: a.connection.id }, orderBy: { id: "desc" } });

  await deliver(meta.statusUpdate(a.phoneNumberId, reply.providerMessageId, "delivered"));
  await deliver(meta.statusUpdate(a.phoneNumberId, reply.providerMessageId, "read"));
  await deliver(meta.statusUpdate(a.phoneNumberId, reply.providerMessageId, "delivered")); // nje ya mpangilio
  const after = await prisma.message.findUnique({ where: { id: reply.id } });
  assert.strictEqual(after.status, "read");
  const history = await prisma.whatsAppMessageStatus.findMany({ where: { providerMessageId: reply.providerMessageId } });
  assert.deepStrictEqual(history.map((h) => h.status).sort(), ["delivered", "read"]);

  await deliver(meta.statusUpdate(a.phoneNumberId, reply.providerMessageId, "failed", { errors: [{ code: 131026, title: "Message undeliverable" }] }));
  const failed = await prisma.message.findUnique({ where: { id: reply.id } });
  assert.strictEqual(failed.status, "failed");
  assert.strictEqual(failed.errorCode, "131026");
});

test("a status from merchant B's number cannot change merchant A's message", async () => {
  const a = await setupMerchant();
  const b = await setupMerchant();
  const { waId } = await consentedCustomer(a.merchant.id);
  await deliver(meta.textMessage(a.phoneNumberId, "habari", { from: waId }));
  const reply = await prisma.message.findFirst({ where: { direction: "outbound", phoneNumberId: a.connection.id }, orderBy: { id: "desc" } });
  await deliver(meta.statusUpdate(b.phoneNumberId, reply.providerMessageId, "read"));
  assert.strictEqual((await prisma.message.findUnique({ where: { id: reply.id } })).status, "sent");
});

test("temporary Graph failure: retried later WITHOUT calling the AI again", async () => {
  const a = await setupMerchant();
  const { waId } = await consentedCustomer(a.merchant.id);
  let failures = 1;
  graph.setHandler((req, body, next) => {
    if (req.method === "POST" && req.url.endsWith("/messages") && body.type === "text" && failures-- > 0) {
      return { status: 503, json: { error: { message: "Service temporarily unavailable", code: 2 } } };
    }
    return phoneLookupHandler(req, body, next);
  });
  const body = meta.textMessage(a.phoneNumberId, "Bei ya jezi?", { from: waId });
  await deliver(body);
  const event = await prisma.whatsAppWebhookEvent.findFirst({ where: { phoneNumberId: a.phoneNumberId }, orderBy: { id: "desc" } });
  assert.strictEqual(event.status, "pending");
  assert.strictEqual(event.attempts, 1);
  const queued = await prisma.message.findFirst({ where: { inReplyToId: { not: null }, phoneNumberId: a.connection.id }, orderBy: { id: "desc" } });
  assert.strictEqual(queued.status, "queued");

  await prisma.whatsAppWebhookEvent.update({ where: { id: event.id }, data: { nextAttemptAt: new Date() } });
  await worker.drain();
  assert.strictEqual(aiCalls.length, 1, "AI was called exactly once");
  assert.strictEqual((await prisma.message.findUnique({ where: { id: queued.id } })).status, "sent");
  assert.strictEqual((await prisma.whatsAppWebhookEvent.findUnique({ where: { id: event.id } })).status, "done");
});

test("repeated failures end in the dead-letter state", async () => {
  const a = await setupMerchant();
  const { waId } = await consentedCustomer(a.merchant.id);
  graph.setHandler((req, body, next) =>
    req.method === "POST" && body.type === "text" ? { status: 500, json: { error: { message: "boom", code: 1 } } } : phoneLookupHandler(req, body, next)
  );
  await deliver(meta.textMessage(a.phoneNumberId, "habari", { from: waId }));
  const event = await prisma.whatsAppWebhookEvent.findFirst({ where: { phoneNumberId: a.phoneNumberId }, orderBy: { id: "desc" } });
  for (let i = 1; i < worker.MAX_ATTEMPTS; i++) {
    await prisma.whatsAppWebhookEvent.update({ where: { id: event.id }, data: { nextAttemptAt: new Date() } });
    await worker.drain();
  }
  const dead = await prisma.whatsAppWebhookEvent.findUnique({ where: { id: event.id } });
  assert.strictEqual(dead.status, "dead");
  assert.strictEqual(dead.attempts, worker.MAX_ATTEMPTS);
});

test("non-retryable Graph error marks the reply failed and finishes the event", async () => {
  const a = await setupMerchant();
  const { waId } = await consentedCustomer(a.merchant.id);
  graph.setHandler((req, body, next) =>
    req.method === "POST" && body.type === "text" ? { status: 400, json: { error: { message: "Recipient not on WhatsApp", code: 131026 } } } : phoneLookupHandler(req, body, next)
  );
  await deliver(meta.textMessage(a.phoneNumberId, "habari", { from: waId }));
  const reply = await prisma.message.findFirst({ where: { direction: "outbound", phoneNumberId: a.connection.id }, orderBy: { id: "desc" } });
  assert.strictEqual(reply.status, "failed");
  assert.strictEqual(reply.errorCode, "131026");
});

test("expired token: no AI call, no request to Meta, message kept for the merchant, connection flagged", async () => {
  const a = await setupMerchant();
  const { waId, conversation } = await consentedCustomer(a.merchant.id);
  await prisma.whatsAppCredential.update({ where: { accountId: a.connection.account.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await deliver(meta.textMessage(a.phoneNumberId, "habari", { from: waId }));
  assert.strictEqual(graph.calls.filter((c) => c.method === "POST").length, 0);
  assert.strictEqual(aiCalls.length, 0);
  const event = await prisma.whatsAppWebhookEvent.findFirst({ where: { phoneNumberId: a.phoneNumberId }, orderBy: { id: "desc" } });
  assert.strictEqual(event.status, "done");
  assert.strictEqual(event.lastError, "token_expired");
  assert.ok(await prisma.message.findFirst({ where: { conversationId: conversation.id, sender: "customer" } }));
  const phone = await prisma.whatsAppPhoneNumber.findUnique({ where: { id: a.connection.id } });
  assert.strictEqual(phone.status, "error");
  assert.strictEqual(phone.lastError, "token_expired");
});

test("Meta rejecting the token (code 190) invalidates the credential", async () => {
  const a = await setupMerchant();
  const { waId } = await consentedCustomer(a.merchant.id);
  graph.setHandler((req, body, next) =>
    req.method === "POST" && body.type === "text" ? { status: 401, json: { error: { message: "Error validating access token", code: 190 } } } : phoneLookupHandler(req, body, next)
  );
  await deliver(meta.textMessage(a.phoneNumberId, "habari", { from: waId }));
  const cred = await prisma.whatsAppCredential.findUnique({ where: { accountId: a.connection.account.id } });
  assert.strictEqual(cred.status, "invalid");
});

test("disconnected account: messages are ignored", async () => {
  const a = await setupMerchant();
  const { waId } = await consentedCustomer(a.merchant.id);
  await connectionService.disconnect(a.merchant.id, a.connection.id);
  await deliver(meta.textMessage(a.phoneNumberId, "habari", { from: waId }));
  assert.strictEqual(aiCalls.length, 0);
  assert.strictEqual(graph.sentMessages().length, 0);
  const cred = await prisma.whatsAppCredential.findUnique({ where: { accountId: a.connection.account.id } });
  assert.strictEqual(cred.status, "revoked");
  assert.ok(!cred.encryptedToken.includes("EAAG"));
});

test("human takeover: AI stays silent, merchant replies manually, then AI resumes", async () => {
  const a = await setupMerchant();
  const { waId, conversation } = await consentedCustomer(a.merchant.id);
  const auth = { "Content-Type": "application/json", Authorization: `Bearer ${tokenFor(a.merchant)}` };

  let res = await fetch(`${app.url}/api/conversations/${conversation.id}/needs-human`, { method: "PUT", headers: auth, body: JSON.stringify({ needsHuman: true }) });
  assert.strictEqual((await res.json()).handoverState, "HUMAN_ACTIVE");

  await deliver(meta.textMessage(a.phoneNumberId, "Bei ya jezi?", { from: waId }));
  assert.strictEqual(aiCalls.length, 0);
  assert.strictEqual(graph.sentMessages().length, 0);
  const saved = await prisma.message.findFirst({ where: { conversationId: conversation.id, sender: "customer" }, orderBy: { id: "desc" } });
  assert.ok(saved, "customer message still visible to the merchant");

  res = await fetch(`${app.url}/api/conversations/${conversation.id}/reply`, { method: "POST", headers: auth, body: JSON.stringify({ text: "Ni elfu 35, karibu!" }) });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(graph.sentMessages()[0].body.text.body, "Ni elfu 35, karibu!");
  const manual = await prisma.message.findFirst({ where: { conversationId: conversation.id, sender: "merchant" } });
  assert.match(manual.providerMessageId, /^wamid\./);

  res = await fetch(`${app.url}/api/conversations/${conversation.id}/needs-human`, { method: "PUT", headers: auth, body: JSON.stringify({ needsHuman: false }) });
  assert.strictEqual((await res.json()).handoverState, "AI_RESUMED");
  await deliver(meta.textMessage(a.phoneNumberId, "Bei ya jezi?", { from: waId }));
  assert.strictEqual(aiCalls.length, 1);
});

test("merchant takes over while the AI is thinking: AI reply is cancelled, not sent", async () => {
  const a = await setupMerchant();
  const { waId, conversation } = await consentedCustomer(a.merchant.id);
  onAiCall = () => require("../src/services/humanHandoverService").takeOver(a.merchant.id, conversation.id);
  await deliver(meta.textMessage(a.phoneNumberId, "Bei ya jezi?", { from: waId }));
  assert.strictEqual(graph.sentMessages().length, 0);
  const reply = await prisma.message.findFirst({ where: { conversationId: conversation.id, sender: "ai" }, orderBy: { id: "desc" } });
  assert.strictEqual(reply.status, "cancelled");
});

test("customer asks for a human (option 2): AI_ACTIVE -> HUMAN_REQUESTED, acknowledgement still sent", async () => {
  const a = await setupMerchant();
  const waId = `25568${Date.now() % 1e7}`;
  await deliver(meta.textMessage(a.phoneNumberId, "Habari", { from: waId }));
  await deliver(meta.textMessage(a.phoneNumberId, "2", { from: waId }));
  const conv = await prisma.conversation.findFirst({ where: { merchantId: a.merchant.id, customerWaId: waId } });
  assert.strictEqual(conv.handoverState, "HUMAN_REQUESTED");
  assert.match(sentTexts()[1], /mmiliki atawasiliana nawe/);
});

test("bot switched off (stored in DB): message logged, no reply", async () => {
  const a = await setupMerchant({ merchantData: { botActive: false } });
  const { waId } = await consentedCustomer(a.merchant.id);
  await deliver(meta.textMessage(a.phoneNumberId, "Bei ya jezi?", { from: waId }));
  assert.strictEqual(aiCalls.length, 0);
  assert.strictEqual(graph.sentMessages().length, 0);
});

test("STOP opts the customer out (conversation + CustomerOptIn), and marketing is then refused", async () => {
  const a = await setupMerchant();
  const { waId, conversation } = await consentedCustomer(a.merchant.id);
  await deliver(meta.textMessage(a.phoneNumberId, "STOP", { from: waId }));
  assert.match(sentTexts()[0], /Hutapokea tena/);
  assert.strictEqual(aiCalls.length, 0);
  assert.strictEqual((await prisma.conversation.findUnique({ where: { id: conversation.id } })).optedOut, true);
  const optIn = await prisma.customerOptIn.findUnique({ where: { merchantId_customerWaId: { merchantId: a.merchant.id, customerWaId: waId } } });
  assert.strictEqual(optIn.marketingOptIn, false);
  assert.ok(optIn.optedOutAt);

  const r = await messageSender.sendToCustomer({ merchantId: a.merchant.id, customerPhone: conversation.customerPhone, text: "Ofa!", kind: "marketing" });
  assert.deepStrictEqual([r.sent, r.reason], [false, "opted_out"]);
});

test("24-hour window: free-form messages are refused outside it (no request to Meta)", async () => {
  const a = await setupMerchant();
  const { conversation } = await consentedCustomer(a.merchant.id, { lastInboundAt: new Date(Date.now() - 25 * 3600e3) });
  const r = await messageSender.sendToCustomer({ merchantId: a.merchant.id, customerPhone: conversation.customerPhone, text: "Oda yako imefika" });
  assert.deepStrictEqual([r.sent, r.reason], [false, "outside_24h_window"]);
  assert.strictEqual(graph.sentMessages().length, 0);

  await prisma.conversation.update({ where: { id: conversation.id }, data: { lastInboundAt: new Date(Date.now() - 23 * 3600e3) } });
  const ok = await messageSender.sendToCustomer({ merchantId: a.merchant.id, customerPhone: conversation.customerPhone, text: "Oda yako imefika" });
  assert.strictEqual(ok.sent, true);
});

test("order status update from the dashboard is sent through Cloud API inside the window", async () => {
  const a = await setupMerchant();
  const { conversation } = await consentedCustomer(a.merchant.id);
  const order = await prisma.order.create({
    data: { merchantId: a.merchant.id, conversationId: conversation.id, customerName: "Juma", customerPhone: conversation.customerPhone, productName: "Jezi ya Simba", deliveryType: "pickup" },
  });
  const res = await fetch(`${app.url}/api/orders/${order.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenFor(a.merchant)}` },
    body: JSON.stringify({ status: "confirmed" }),
  });
  assert.strictEqual((await res.json()).customerNotified, true);
  assert.strictEqual(graph.sentMessages().length, 1);
});

test("one number, one adapter: Baileys refuses to start for a Cloud API merchant", async () => {
  const a = await setupMerchant();
  const manager = require("../src/whatsapp/manager");
  assert.strictEqual(await manager.startSession(a.merchant.id), null);
  await assert.rejects(manager.requestPairingCode(a.merchant.id, "0712345678"), /Cloud API/);
});

test("connecting a number already owned by another merchant is refused", async () => {
  const a = await setupMerchant();
  const other = await createMerchant(prisma);
  await assert.rejects(
    connectionService.connect({ merchantId: other.id, wabaId: "WABA_OTHER", phoneNumberId: a.phoneNumberId, accessToken: "EAAG-x" }),
    /tayari imeunganishwa/
  );
});

test("access tokens are never returned by the API or stored in plaintext", async () => {
  const a = await setupMerchant();
  const res = await fetch(`${app.url}/api/whatsapp/connections`, { headers: { Authorization: `Bearer ${tokenFor(a.merchant)}` } });
  const text = await res.text();
  assert.doesNotMatch(text, /EAAG|encryptedToken|tok1:/);
  const cred = await prisma.whatsAppCredential.findUnique({ where: { accountId: a.connection.account.id } });
  assert.match(cred.encryptedToken, /^tok1:/);
  assert.ok(!cred.encryptedToken.includes("EAAG"));
});
