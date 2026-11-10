// Merchant B anajaribu kusoma/kubadilisha data ya merchant A kupitia kila endpoint yenye :id
const { startApp, tokenFor, createMerchant } = require("./helpers/setup");
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const prisma = require("../src/db/client");

let app, A, B, data;

before(async () => {
  app = await startApp();
  A = await createMerchant(prisma);
  B = await createMerchant(prisma);
  const conversation = await prisma.conversation.create({
    data: { merchantId: A.id, customerPhone: `2557${Date.now() % 1e8}@s.whatsapp.net`, consentGiven: true, lastInboundAt: new Date() },
  });
  await prisma.message.create({ data: { conversationId: conversation.id, sender: "customer", content: "SIRI-YA-A" } });
  const product = await prisma.product.create({ data: { merchantId: A.id, name: "Bidhaa ya A", category: "X", price: 1000, stock: 5 } });
  const order = await prisma.order.create({
    data: { merchantId: A.id, conversationId: conversation.id, customerName: "Mteja", customerPhone: conversation.customerPhone, productName: "Bidhaa ya A", deliveryType: "pickup" },
  });
  const specialRequest = await prisma.specialRequest.create({
    data: { merchantId: A.id, conversationId: conversation.id, customerName: "Mteja", customerPhone: conversation.customerPhone, productName: "Kitu", deliveryType: "pickup" },
  });
  const account = await prisma.whatsAppAccount.create({ data: { merchantId: A.id, wabaId: `WABA_ISO_${Date.now()}` } });
  const phone = await prisma.whatsAppPhoneNumber.create({
    data: { merchantId: A.id, accountId: account.id, phoneNumberId: `PN_ISO_${Date.now()}`, phoneE164: `2559${Date.now() % 1e8}`, status: "connected" },
  });
  data = { conversation, product, order, specialRequest, phone };
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});

function asB(method, path, body) {
  return fetch(`${app.url}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenFor(B)}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test("merchant B cannot read or change merchant A's data through any :id route", async () => {
  const { conversation, product, order, specialRequest, phone } = data;
  const attempts = [
    ["GET", `/conversations/${conversation.id}/messages`],
    ["PUT", `/conversations/${conversation.id}/contact-type`, { contactType: "personal" }],
    ["PUT", `/conversations/${conversation.id}/needs-human`, { needsHuman: true }],
    ["POST", `/conversations/${conversation.id}/reply`, { text: "hacked" }],
    ["PUT", `/products/${product.id}`, { name: "Hacked", price: 1 }],
    ["DELETE", `/products/${product.id}`],
    ["PUT", `/orders/${order.id}`, { status: "cancelled" }],
    ["PUT", `/special-requests/${specialRequest.id}`, { status: "cancelled" }],
    ["DELETE", `/whatsapp/connections/${phone.id}`],
  ];
  for (const [method, path, body] of attempts) {
    const res = await asB(method, path, body);
    const text = await res.text();
    assert.ok([403, 404].includes(res.status), `${method} ${path} returned ${res.status}`);
    assert.doesNotMatch(text, /SIRI-YA-A/, `${method} ${path} leaked data`);
  }

  // Hakuna kilichobadilika
  assert.strictEqual((await prisma.conversation.findUnique({ where: { id: conversation.id } })).contactType, "customer");
  assert.strictEqual((await prisma.conversation.findUnique({ where: { id: conversation.id } })).needsHuman, false);
  assert.strictEqual((await prisma.product.findUnique({ where: { id: product.id } })).name, "Bidhaa ya A");
  assert.strictEqual((await prisma.order.findUnique({ where: { id: order.id } })).status, "pending");
  assert.strictEqual((await prisma.specialRequest.findUnique({ where: { id: specialRequest.id } })).status, "new");
  assert.strictEqual((await prisma.whatsAppPhoneNumber.findUnique({ where: { id: phone.id } })).status, "connected");
});

test("list endpoints only return the caller's own records", async () => {
  for (const path of ["/conversations", "/orders", "/products", "/special-requests", "/whatsapp/connections"]) {
    const text = await (await asB("GET", path)).text();
    assert.doesNotMatch(text, /Bidhaa ya A|PN_ISO_|SIRI-YA-A/, `${path} leaked merchant A's data`);
  }
});

test("a merchant JWT cannot reach Super Admin routes", async () => {
  for (const path of ["/superadmin/merchants", "/superadmin/whatsapp/connections", "/superadmin/whatsapp/webhook-events"]) {
    const res = await asB("GET", path);
    assert.strictEqual(res.status, 403, path);
  }
});

test("a suspended merchant's existing token is refused", async () => {
  const S = await createMerchant(prisma, { status: "suspended" });
  const res = await fetch(`${app.url}/api/products`, { headers: { Authorization: `Bearer ${tokenFor(S)}` } });
  assert.strictEqual(res.status, 403);
});
