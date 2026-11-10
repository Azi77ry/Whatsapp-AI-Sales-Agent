// Lazima i-require-iwe KWANZA kwenye kila faili la test (kabla ya src/*).
// Inaweka mazingira ya test na KUZUIA tests zisiguse database ya production.

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret";
process.env.ENCRYPTION_KEY = "test-encryption-key-0123456789ab";
process.env.ADMIN_PASSWORD = "test-admin";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || "postgresql://postgres@localhost:55432/aziry_v2_test";

// Futa credentials zote za huduma za nje - .env haiwezi kuzijaza (dotenv haiandiki juu ya key iliyopo)
// ili tests zisiite AzamPay, AI providers, SMTP wala Meta halisi.
for (const key of [
  "AZAMPAY_TOKEN", "AZAMPAY_CLIENT_ID", "AZAMPAY_CLIENT_SECRET", "AZAMPAY_APP_NAME",
  "GEMINI_API_KEY", "GROQ_API_KEY", "QWEN_API_KEY", "DEEPSEEK_API_KEY", "TOGETHER_API_KEY", "OPENAI_API_KEY",
  "SMTP_HOST", "SMTP_USER", "SMTP_PASS",
  "META_APP_ID", "META_APP_SECRET", "META_WEBHOOK_VERIFY_TOKEN", "META_EMBEDDED_SIGNUP_CONFIG_ID",
  "TOKEN_ENCRYPTION_KEY", "DATA_ENCRYPTION_KEY",
]) {
  process.env[key] = "";
}
process.env.META_GRAPH_BASE_URL = "http://127.0.0.1:9"; // haifikiki - tests lazima zi-mock Graph API

const host = new URL(process.env.DATABASE_URL).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  throw new Error(`Tests zimesimamishwa: DATABASE_URL lazima iwe localhost (imepata "${host}").`);
}

const jwt = require("jsonwebtoken");

/** Anzisha app kwenye port ya nasibu; inarudisha { url, close } */
async function startApp() {
  const app = require("../../src/app");
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((r) => server.close(r)),
  };
}

function tokenFor(merchant) {
  return jwt.sign(
    { merchantId: merchant.id, email: merchant.email, role: merchant.role || "merchant" },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
}

let counter = 0;
async function createMerchant(prisma, data = {}) {
  counter += 1;
  const unique = `${Date.now()}-${process.pid}-${counter}`;
  return prisma.merchant.create({
    data: {
      businessName: `Test Shop ${unique}`,
      email: `shop-${unique}@test.local`,
      passwordHash: "x",
      ...data,
    },
  });
}

module.exports = { startApp, tokenFor, createMerchant };
