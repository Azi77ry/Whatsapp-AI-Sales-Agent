require("./helpers/setup");
const { test } = require("node:test");
const assert = require("node:assert");
const nodeCrypto = require("node:crypto");
const { encrypt, decrypt, encryptSecret, decryptSecret, needsReencryption } = require("../src/utils/crypto");

// Ciphertext ya V1 (AES-256-CBC) kama ilivyoandikwa na mfumo wa zamani
function legacyEncrypt(text) {
  const key = Buffer.from(process.env.ENCRYPTION_KEY.padEnd(32, "0").slice(0, 32), "utf-8");
  const iv = nodeCrypto.randomBytes(16);
  const c = nodeCrypto.createCipheriv("aes-256-cbc", key, iv);
  return `enc:${iv.toString("hex")}:${c.update(text, "utf-8", "hex")}${c.final("hex")}`;
}

test("new messages use authenticated GCM and round-trip", () => {
  const ct = encrypt("Habari, bei ya jezi ni ngapi? 😊");
  assert.match(ct, /^v2:/);
  assert.strictEqual(decrypt(ct), "Habari, bei ya jezi ni ngapi? 😊");
  assert.notStrictEqual(encrypt("same"), encrypt("same"), "random IV per message");
});

test("old V1 (CBC) messages are still readable", () => {
  assert.strictEqual(decrypt(legacyEncrypt("ujumbe wa zamani")), "ujumbe wa zamani");
  assert.strictEqual(decrypt("plain old text"), "plain old text");
});

test("tampered GCM ciphertext is rejected, not returned as garbage", () => {
  const ct = encrypt("secret order");
  const parts = ct.split(":");
  const data = Buffer.from(parts[3], "base64url");
  data[0] ^= 0xff;
  parts[3] = data.toString("base64url");
  assert.strictEqual(decrypt(parts.join(":")), "[Encrypted Message Unreadable]");
});

test("token encryption requires TOKEN_ENCRYPTION_KEY and never falls back to plaintext", () => {
  process.env.TOKEN_ENCRYPTION_KEY = "";
  assert.throws(() => encryptSecret("EAAG-token"), /TOKEN_ENCRYPTION_KEY/);

  process.env.TOKEN_ENCRYPTION_KEY = "short";
  assert.throws(() => encryptSecret("EAAG-token"), /bytes 32/);
});

test("token key rotation: old ciphertext decrypts with the previous key", () => {
  const oldKey = nodeCrypto.randomBytes(32).toString("base64");
  const newKey = nodeCrypto.randomBytes(32).toString("base64");

  process.env.TOKEN_ENCRYPTION_KEY = oldKey;
  const ct = encryptSecret("EAAG-old-token");
  assert.ok(!ct.includes("EAAG"));

  process.env.TOKEN_ENCRYPTION_KEY = newKey;
  process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS = oldKey;
  assert.strictEqual(decryptSecret(ct), "EAAG-old-token");
  assert.strictEqual(needsReencryption(ct), true);

  process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS = "";
  assert.throws(() => decryptSecret(ct), /Imeshindwa/);
  process.env.TOKEN_ENCRYPTION_KEY = "";
});
