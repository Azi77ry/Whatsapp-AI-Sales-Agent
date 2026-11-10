const { startApp, tokenFor, createMerchant } = require("./helpers/setup");
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const prisma = require("../src/db/client");

let app;
before(async () => {
  process.env.AZAMPAY_CALLBACK_SECRET = "callback-secret-123";
  app = await startApp();
});
after(async () => {
  await app.close();
  await prisma.$disconnect();
});

async function createPendingPayment(merchant, amount = 30000) {
  return prisma.subscriptionPayment.create({
    data: {
      merchantId: merchant.id,
      amount,
      phoneNumber: "0712345678",
      provider: "Mpesa",
      referenceId: `SUB-${merchant.id}-${Date.now()}-${Math.random()}`,
    },
  });
}

function postWebhook(query, body) {
  return fetch(`${app.url}/api/billing/webhook${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("AzamPay webhook is reachable without a JWT and activates the subscription", async () => {
  const merchant = await createMerchant(prisma);
  const payment = await createPendingPayment(merchant);

  const res = await postWebhook("?key=callback-secret-123", {
    externalId: payment.referenceId, transactionId: "AZ-1", status: "SUCCESS", amount: "30000",
  });
  assert.strictEqual(res.status, 200);

  const updated = await prisma.merchant.findUnique({ where: { id: merchant.id } });
  assert.strictEqual(updated.subscriptionPlan, "monthly");
  assert.ok(updated.subscriptionEndDate > new Date());
});

test("AzamPay webhook rejects a missing or wrong callback key", async () => {
  const merchant = await createMerchant(prisma);
  const payment = await createPendingPayment(merchant);

  for (const query of ["", "?key=wrong", "?key=callback-secret-12"]) {
    const res = await postWebhook(query, { externalId: payment.referenceId, status: "SUCCESS" });
    assert.strictEqual(res.status, 401, `query "${query}" should be rejected`);
  }
  const unchanged = await prisma.subscriptionPayment.findUnique({ where: { id: payment.id } });
  assert.strictEqual(unchanged.status, "pending");
});

test("AzamPay webhook rejects an amount that does not match the payment", async () => {
  const merchant = await createMerchant(prisma);
  const payment = await createPendingPayment(merchant, 30000);
  const res = await postWebhook("?key=callback-secret-123", {
    externalId: payment.referenceId, status: "SUCCESS", amount: "100",
  });
  assert.strictEqual(res.status, 400);
  const unchanged = await prisma.merchant.findUnique({ where: { id: merchant.id } });
  assert.strictEqual(unchanged.subscriptionEndDate, null);
});

test("image upload ignores the client's file extension (no stored .html)", async () => {
  const merchant = await createMerchant(prisma);
  const form = new FormData();
  form.append("image", new Blob(["<script>alert(1)</script>"], { type: "image/png" }), "evil.html");

  const res = await fetch(`${app.url}/api/products/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenFor(merchant)}` },
    body: form,
  });
  assert.strictEqual(res.status, 200);
  const { imageUrl } = await res.json();
  assert.match(imageUrl, /\.png$/);

  const served = await fetch(`${app.url}${imageUrl}`);
  assert.doesNotMatch(served.headers.get("content-type") || "", /html/);

  require("fs").rmSync(require("path").join(__dirname, "..", "public", imageUrl), { force: true });
});
