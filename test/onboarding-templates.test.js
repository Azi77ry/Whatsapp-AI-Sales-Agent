// Embedded Signup (server side) + templates nje ya dirisha la saa 24 - Graph API ni mock
process.env.FEATURE_CLOUD_API = "true";
process.env.WEBHOOK_WORKER_IN_PROCESS = "false";
const { startApp, tokenFor, createMerchant } = require("./helpers/setup");
process.env.TOKEN_ENCRYPTION_KEY = require("node:crypto").randomBytes(32).toString("base64");

const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert");
const meta = require("./helpers/meta");

let app, graph, prisma, config, worker, messageSender, connectionService;
let seq = 0;
const EXCHANGED_TOKEN = "EAAG-exchanged-business-token";

before(async () => {
  graph = await meta.startGraphMock();
  config = require("../src/config");
  Object.assign(config.meta, {
    graphBaseUrl: graph.url, appSecret: "test-app-secret", appId: "APP123", embeddedSignupConfigId: "CFG1",
  });
  app = await startApp();
  prisma = require("../src/db/client");
  worker = require("../src/services/webhookWorker");
  messageSender = require("../src/integrations/whatsapp/messageSender");
  connectionService = require("../src/integrations/whatsapp/connectionService");
});
after(async () => {
  await app.close();
  await graph.close();
  await prisma.$disconnect();
});

let scopes;
beforeEach(() => {
  graph.reset();
  config.features.embeddedSignup = true;
  scopes = [
    { scope: "whatsapp_business_management", target_ids: [] },
    { scope: "whatsapp_business_messaging", target_ids: [] },
  ];
  graph.setHandler(metaHandler);
});

// Mock ya Graph API kwa mtiririko wa onboarding
function metaHandler(req, body, next) {
  const url = new URL(req.url, "http://x");
  if (url.pathname.endsWith("/oauth/access_token")) {
    if (url.searchParams.get("client_secret") !== "test-app-secret") return { status: 400, json: { error: { message: "bad secret", code: 1 } } };
    return { status: 200, json: { access_token: EXCHANGED_TOKEN, token_type: "bearer" } };
  }
  if (url.pathname.endsWith("/debug_token")) {
    return { status: 200, json: { data: { app_id: "APP123", is_valid: true, scopes: scopes.map((s) => s.scope), granular_scopes: scopes } } };
  }
  const phones = url.pathname.match(/\/(WABA_\w+)\/phone_numbers$/);
  if (phones) return { status: 200, json: { data: [{ id: `PN_${phones[1].slice(5)}` }] } };
  if (/\/subscribed_apps$/.test(url.pathname) || /\/register$/.test(url.pathname)) return { status: 200, json: { success: true } };
  const lookup = req.method === "GET" && url.pathname.match(/\/PN_(\d+)$/);
  if (lookup) return { status: 200, json: { display_phone_number: `+${lookup[1]}`, verified_name: "Duka" } };
  return next(req, body);
}

function ids() {
  seq += 1;
  const digits = `2558${String(Date.now()).slice(-6)}${seq}`;
  return { wabaId: `WABA_${digits}`, phoneNumberId: `PN_${digits}` };
}

async function api(merchant, method, path, body) {
  const res = await fetch(`${app.url}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenFor(merchant)}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, text: await res.text() };
}

async function signup(merchant, overrides = {}) {
  const cfg = JSON.parse((await api(merchant, "GET", "/whatsapp/embedded-signup/config")).text);
  return api(merchant, "POST", "/whatsapp/embedded-signup/complete", { code: "AUTH_CODE", state: cfg.state, ...ids(), ...overrides });
}

test("Embedded Signup is off behind the feature flag", async () => {
  config.features.embeddedSignup = false;
  const m = await createMerchant(prisma);
  assert.deepStrictEqual(JSON.parse((await api(m, "GET", "/whatsapp/embedded-signup/config")).text), { enabled: false });
  const res = await api(m, "POST", "/whatsapp/embedded-signup/complete", { code: "x", state: "x", ...ids() });
  assert.strictEqual(res.status, 404);
  assert.strictEqual(graph.calls.length, 0);
});

test("Embedded Signup: code exchanged server-side, assets validated, app subscribed, number registered, connection saved", async () => {
  const m = await createMerchant(prisma);
  const cfg = JSON.parse((await api(m, "GET", "/whatsapp/embedded-signup/config")).text);
  assert.deepStrictEqual([cfg.enabled, cfg.appId, cfg.configId], [true, "APP123", "CFG1"]);
  assert.doesNotMatch(JSON.stringify(cfg), /test-app-secret/);

  const { wabaId, phoneNumberId } = ids();
  const res = await api(m, "POST", "/whatsapp/embedded-signup/complete", { code: "AUTH_CODE", state: cfg.state, wabaId, phoneNumberId });
  assert.strictEqual(res.status, 200, res.text);
  assert.doesNotMatch(res.text, /EAAG/, "token never sent to the browser");

  const subscribe = graph.calls.find((c) => c.url.includes(`/${wabaId}/subscribed_apps`));
  assert.strictEqual(subscribe.headers.authorization, `Bearer ${EXCHANGED_TOKEN}`);
  const register = graph.calls.find((c) => c.url.includes(`/${phoneNumberId}/register`));
  assert.match(register.body.pin, /^\d{6}$/);

  const phone = await prisma.whatsAppPhoneNumber.findUnique({ where: { phoneNumberId }, include: { account: { include: { credential: true } } } });
  assert.strictEqual(phone.merchantId, m.id);
  assert.strictEqual(phone.status, "connected");
  assert.strictEqual(phone.account.credential.tokenType, "business_integration");
  assert.ok(!phone.account.credential.encryptedToken.includes("EAAG"));
});

test("Embedded Signup: a state issued to another merchant is rejected", async () => {
  const a = await createMerchant(prisma);
  const b = await createMerchant(prisma);
  const stateForA = JSON.parse((await api(a, "GET", "/whatsapp/embedded-signup/config")).text).state;
  const res = await api(b, "POST", "/whatsapp/embedded-signup/complete", { code: "AUTH_CODE", state: stateForA, ...ids() });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(graph.calls.length, 0, "no code exchange for a forged state");
});

test("Embedded Signup: missing permission or a number outside the WABA is refused and nothing is saved", async () => {
  const m = await createMerchant(prisma);
  scopes = scopes.filter((s) => s.scope !== "whatsapp_business_messaging");
  let res = await signup(m);
  assert.strictEqual(res.status, 403);
  assert.match(res.text, /whatsapp_business_messaging/);

  beforeEachReset();
  res = await signup(m, { phoneNumberId: "PN_999999999" });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(await prisma.whatsAppPhoneNumber.count({ where: { merchantId: m.id } }), 0);
});

function beforeEachReset() {
  scopes = [
    { scope: "whatsapp_business_management", target_ids: [] },
    { scope: "whatsapp_business_messaging", target_ids: [] },
  ];
}

test("Embedded Signup: token scoped to a different WABA is refused", async () => {
  const m = await createMerchant(prisma);
  scopes = scopes.map((s) => ({ ...s, target_ids: ["SOME_OTHER_WABA"] }));
  const res = await signup(m);
  assert.strictEqual(res.status, 403);
});

// ── Templates ────────────────────────────────────────────────────────────────

async function connectedMerchantWithCustomer({ hoursSinceCustomer = 30 } = {}) {
  const m = await createMerchant(prisma);
  const { wabaId, phoneNumberId } = ids();
  const connection = await connectionService.connect({ merchantId: m.id, wabaId, phoneNumberId, accessToken: "EAAG-x" });
  const waId = `2557${String(Date.now()).slice(-7)}${++seq}`;
  const conversation = await prisma.conversation.create({
    data: { merchantId: m.id, customerPhone: `${waId}@s.whatsapp.net`, customerWaId: waId, lastInboundAt: new Date(Date.now() - hoursSinceCustomer * 3600e3) },
  });
  return { m, connection, wabaId, phoneNumberId, waId, conversation };
}

test("templates: sync from Meta, approval webhook updates status, purpose assignment is per merchant", async () => {
  const ctx = await connectedMerchantWithCustomer();
  graph.setHandler((req, body, next) => {
    if (req.url.includes(`/${ctx.wabaId}/message_templates`)) {
      return { status: 200, json: { data: [
        { id: "T1", name: "order_update", language: "sw", status: "APPROVED", category: "UTILITY", components: [{ type: "BODY", text: "{{1}}" }] },
        { id: "T2", name: "promo", language: "sw", status: "PENDING", category: "MARKETING" },
      ] } };
    }
    return metaHandler(req, body, next);
  });
  assert.strictEqual(JSON.parse((await api(ctx.m, "POST", "/whatsapp/templates/sync")).text).synced, 2);

  const promoEvent = meta.envelope(ctx.phoneNumberId, {}, { field: "message_template_status_update" });
  promoEvent.entry[0].changes[0].value = { event: "REJECTED", message_template_id: "T2", message_template_name: "promo", message_template_language: "sw", reason: "INCORRECT_CATEGORY" };
  const raw = Buffer.from(JSON.stringify(promoEvent));
  await fetch(`${app.url}/webhooks/whatsapp`, { method: "POST", headers: { "Content-Type": "application/json", "X-Hub-Signature-256": meta.sign(raw, "test-app-secret") }, body: raw });
  await worker.drain();
  const promo = await prisma.whatsAppTemplate.findFirst({ where: { metaTemplateId: "T2" } });
  assert.deepStrictEqual([promo.status, promo.rejectedReason], ["REJECTED", "INCORRECT_CATEGORY"]);

  const t1 = await prisma.whatsAppTemplate.findFirst({ where: { metaTemplateId: "T1", account: { merchantId: ctx.m.id } } });
  const other = await createMerchant(prisma);
  assert.strictEqual((await api(other, "PUT", `/whatsapp/templates/${t1.id}/purpose`, { purpose: "order_update" })).status, 404);
  assert.strictEqual((await api(ctx.m, "PUT", `/whatsapp/templates/${t1.id}/purpose`, { purpose: "order_update" })).status, 200);
});

test("outside 24h: order update goes out as the approved utility template", async () => {
  const ctx = await connectedMerchantWithCustomer({ hoursSinceCustomer: 30 });
  await prisma.whatsAppTemplate.create({
    data: { accountId: ctx.connection.account.id, name: "order_update", language: "sw", category: "UTILITY", status: "APPROVED", purpose: "order_update" },
  });
  const r = await messageSender.sendToCustomer({ merchantId: ctx.m.id, customerPhone: ctx.conversation.customerPhone, text: "Oda #5 imethibitishwa\nAsante!", kind: "transactional" });
  assert.strictEqual(r.sent, true);
  const sent = graph.sentMessages()[0].body;
  assert.strictEqual(sent.type, "template");
  assert.strictEqual(sent.template.name, "order_update");
  assert.strictEqual(sent.template.components[0].parameters[0].text, "Oda #5 imethibitishwa Asante!");
});

test("outside 24h: a free-form reply is never converted to a template", async () => {
  const ctx = await connectedMerchantWithCustomer({ hoursSinceCustomer: 30 });
  await prisma.whatsAppTemplate.create({
    data: { accountId: ctx.connection.account.id, name: "order_update", language: "sw", category: "UTILITY", status: "APPROVED", purpose: "order_update" },
  });
  const r = await messageSender.sendToCustomer({ merchantId: ctx.m.id, customerPhone: ctx.conversation.customerPhone, text: "habari", kind: "reply" });
  assert.deepStrictEqual([r.sent, r.reason], [false, "outside_24h_window"]);
});

test("outside 24h: marketing template requires explicit opt-in", async () => {
  const ctx = await connectedMerchantWithCustomer({ hoursSinceCustomer: 30 });
  await prisma.whatsAppTemplate.create({
    data: { accountId: ctx.connection.account.id, name: "promo", language: "sw", category: "MARKETING", status: "APPROVED", purpose: "reengagement" },
  });
  let r = await messageSender.sendToCustomer({ merchantId: ctx.m.id, customerPhone: ctx.conversation.customerPhone, text: "Ofa!", kind: "marketing" });
  assert.deepStrictEqual([r.sent, r.reason], [false, "no_marketing_opt_in"]);
  assert.strictEqual(graph.sentMessages().length, 0);

  await prisma.customerOptIn.create({ data: { merchantId: ctx.m.id, customerWaId: ctx.waId, marketingOptIn: true, optInAt: new Date(), optInSource: "test" } });
  r = await messageSender.sendToCustomer({ merchantId: ctx.m.id, customerPhone: ctx.conversation.customerPhone, text: "Ofa!", kind: "marketing" });
  assert.strictEqual(r.sent, true);
});

test("unapproved template is never used", async () => {
  const ctx = await connectedMerchantWithCustomer({ hoursSinceCustomer: 30 });
  await prisma.whatsAppTemplate.create({
    data: { accountId: ctx.connection.account.id, name: "order_update", language: "sw", category: "UTILITY", status: "PENDING", purpose: "order_update" },
  });
  const r = await messageSender.sendToCustomer({ merchantId: ctx.m.id, customerPhone: ctx.conversation.customerPhone, text: "x", kind: "transactional" });
  assert.deepStrictEqual([r.sent, r.reason], [false, "outside_24h_window"]);
});
