// Encryption ya data ya mfumo.
//
// Miundo (formats) inayotumika:
//   enc:<iv-hex>:<data-hex>          V1 - AES-256-CBC (bila uthibitisho). Inasomwa tu, haiandikwi tena.
//   v2:<iv>:<tag>:<data>             V2 - AES-256-GCM (authenticated), base64url. Ujumbe wa wateja.
//   tok1:<iv>:<tag>:<data>           AES-256-GCM kwa siri (Meta access tokens) - key yake tofauti.
//
// 🛡️ Ikishindwa ku-encrypt, function INARUSHA (throws) - haihifadhi plaintext kimya kimya.

const crypto = require("crypto");
const config = require("../config");

const V1_PREFIX = "enc:";
const V2_PREFIX = "v2:";
const TOKEN_PREFIX = "tok1:";

// ── V1 (legacy) key: string iliyojazwa "0" hadi bytes 32 - inahifadhiwa ili kusoma data ya zamani tu
const V1_KEY = Buffer.from(config.encryptionKey.padEnd(32, "0").slice(0, 32), "utf-8");

function parseKey(raw, name) {
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(`${name} lazima iwe bytes 32 zilizoandikwa kwa base64 (imepata bytes ${key.length}).`);
  }
  return key;
}

// ── V2 data key: DATA_ENCRYPTION_KEY (base64, bytes 32) au inatokana na ENCRYPTION_KEY kwa HKDF
function dataKey() {
  const explicit = parseKey(process.env.DATA_ENCRYPTION_KEY, "DATA_ENCRYPTION_KEY");
  if (explicit) return explicit;
  return Buffer.from(crypto.hkdfSync("sha256", config.encryptionKey, "aziry-data-v2", "message-content", 32));
}

function tokenKeys() {
  const current = parseKey(process.env.TOKEN_ENCRYPTION_KEY, "TOKEN_ENCRYPTION_KEY");
  const previous = parseKey(process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS, "TOKEN_ENCRYPTION_KEY_PREVIOUS");
  return { current, previous };
}

const b64 = (buf) => buf.toString("base64url");

function gcmEncrypt(prefix, key, text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(String(text), "utf-8"), cipher.final()]);
  return `${prefix}${b64(iv)}:${b64(cipher.getAuthTag())}:${b64(data)}`;
}

function gcmDecrypt(prefix, key, text) {
  const parts = text.slice(prefix.length).split(":");
  if (parts.length !== 3) throw new Error("Muundo wa ciphertext si sahihi");
  const [iv, tag, data] = parts.map((p) => Buffer.from(p, "base64url"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf-8");
}

function decryptV1(text) {
  const parts = text.slice(V1_PREFIX.length).split(":");
  if (parts.length !== 2) throw new Error("Muundo wa V1 si sahihi");
  const decipher = crypto.createDecipheriv("aes-256-cbc", V1_KEY, Buffer.from(parts[0], "hex"));
  return decipher.update(parts[1], "hex", "utf-8") + decipher.final("utf-8");
}

/**
 * Encrypt maudhui ya ujumbe (AES-256-GCM). Inarusha kosa badala ya kurudisha plaintext.
 */
function encrypt(text) {
  if (text === null || text === undefined || text === "") return text;
  return gcmEncrypt(V2_PREFIX, dataKey(), text);
}

/**
 * Decrypt maudhui (V2 au V1). Maandishi yasiyo na prefix yanarudishwa kama yalivyo (data ya zamani sana).
 */
function decrypt(text) {
  if (!text || typeof text !== "string") return text;
  try {
    if (text.startsWith(V2_PREFIX)) return gcmDecrypt(V2_PREFIX, dataKey(), text);
    if (text.startsWith(V1_PREFIX)) return decryptV1(text);
    return text;
  } catch (err) {
    console.error("Decryption failed:", err.message);
    return "[Encrypted Message Unreadable]";
  }
}

/**
 * Encrypt siri (mf. Meta access token). Inahitaji TOKEN_ENCRYPTION_KEY - bila hiyo inarusha kosa.
 */
function encryptSecret(secret) {
  if (!secret) throw new Error("Hakuna siri ya ku-encrypt");
  const { current } = tokenKeys();
  if (!current) throw new Error("TOKEN_ENCRYPTION_KEY haijawekwa - haiwezi kuhifadhi tokens.");
  return gcmEncrypt(TOKEN_PREFIX, current, secret);
}

/**
 * Decrypt siri. Inajaribu key ya sasa kisha ya zamani (wakati wa kubadilisha key / rotation).
 * Inarusha kosa kama haiwezi - haitarudisha kamwe maandishi yasiyo sahihi.
 */
function decryptSecret(ciphertext) {
  if (!ciphertext || !ciphertext.startsWith(TOKEN_PREFIX)) throw new Error("Siri si ya muundo unaojulikana");
  const { current, previous } = tokenKeys();
  for (const key of [current, previous].filter(Boolean)) {
    try {
      return gcmDecrypt(TOKEN_PREFIX, key, ciphertext);
    } catch (_) {
      // jaribu key inayofuata
    }
  }
  throw new Error("Imeshindwa ku-decrypt siri (key si sahihi au data imeharibiwa)");
}

/** Je, siri hii iliandikwa kwa key ya zamani? (itumike kuiandika upya kwa key mpya) */
function needsReencryption(ciphertext) {
  const { current } = tokenKeys();
  if (!current) return false;
  try {
    gcmDecrypt(TOKEN_PREFIX, current, ciphertext);
    return false;
  } catch (_) {
    return true;
  }
}

module.exports = { encrypt, decrypt, encryptSecret, decryptSecret, needsReencryption };
