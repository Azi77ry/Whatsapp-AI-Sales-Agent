const crypto = require("crypto");
const config = require("../config");

// AES-256-CBC needs a 32 byte key and a 16 byte IV
const ALGORITHM = "aes-256-cbc";
const ENCRYPTION_KEY = Buffer.from(config.encryptionKey.padEnd(32, "0").slice(0, 32), "utf-8");
const PREFIX = "enc:";

/**
 * Encrypts plain text into an AES-256-CBC string prefixed with "enc:"
 * format: enc:<iv-hex>:<encrypted-hex>
 */
function encrypt(text) {
  if (!text) return text;
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text, "utf-8", "hex");
    encrypted += cipher.final("hex");
    return `${PREFIX}${iv.toString("hex")}:${encrypted}`;
  } catch (err) {
    console.error("Encryption failed:", err);
    return text; // Fallback to raw text if encryption unexpectedly fails
  }
}

/**
 * Decrypts an encrypted string if it starts with "enc:".
 * If it does not, returns the text as-is for backward compatibility.
 */
function decrypt(text) {
  if (!text) return text;
  if (!text.startsWith(PREFIX)) return text; // Backward compatibility

  try {
    const parts = text.slice(PREFIX.length).split(":");
    if (parts.length !== 2) return text; // Invalid format

    const iv = Buffer.from(parts[0], "hex");
    const encryptedText = parts[1];

    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedText, "hex", "utf-8");
    decrypted += decipher.final("utf-8");
    return decrypted;
  } catch (err) {
    console.error("Decryption failed:", err);
    return "[Encrypted Message Unreadable]";
  }
}

module.exports = { encrypt, decrypt };
