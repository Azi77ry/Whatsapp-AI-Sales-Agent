// Structured logger (JSON line moja kwa kila tukio) kwa ajili ya moduli za V2.
// 🛡️ Inaficha kiotomatiki fields zenye siri (tokens, secrets, passwords, authorization).

const SECRET_KEY_PATTERN = /token|secret|password|authorization|apikey|api_key|access_key|pin/i;

function redact(value, depth = 0) {
  if (depth > 5 || value === null || typeof value !== "object") return value;
  if (value instanceof Error) return { name: value.name, message: value.message, code: value.code };
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SECRET_KEY_PATTERN.test(k) ? "[REDACTED]" : redact(v, depth + 1);
  }
  return out;
}

function write(level, event, fields) {
  if (process.env.NODE_ENV === "test" && process.env.LOG_IN_TESTS !== "true") return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...redact(fields || {}) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

module.exports = {
  info: (event, fields) => write("info", event, fields),
  warn: (event, fields) => write("warn", event, fields),
  error: (event, fields) => write("error", event, fields),
  redact,
};
