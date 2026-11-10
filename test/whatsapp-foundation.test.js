require("./helpers/setup");
const { test } = require("node:test");
const assert = require("node:assert");
const { verifySubscription, verifySignature } = require("../src/integrations/whatsapp/webhookVerifier");
const { extractEvents, waIdToJid, jidToWaId } = require("../src/integrations/whatsapp/messageNormalizer");
const meta = require("./helpers/meta");

test("webhook subscription: returns the challenge only for the right token", () => {
  const q = { "hub.mode": "subscribe", "hub.verify_token": "my-token", "hub.challenge": "12345" };
  assert.strictEqual(verifySubscription(q, "my-token"), "12345");
  assert.strictEqual(verifySubscription({ ...q, "hub.verify_token": "wrong" }, "my-token"), null);
  assert.strictEqual(verifySubscription({ ...q, "hub.mode": "unsubscribe" }, "my-token"), null);
  assert.strictEqual(verifySubscription(q, ""), null, "no configured token = never verify");
});

test("signature: valid HMAC accepted, anything else rejected", () => {
  const raw = Buffer.from(JSON.stringify(meta.textMessage("PN1", "habari")));
  const good = meta.sign(raw, "app-secret");
  assert.strictEqual(verifySignature(raw, good, "app-secret"), true);
  assert.strictEqual(verifySignature(raw, meta.sign(raw, "other-secret"), "app-secret"), false);
  assert.strictEqual(verifySignature(Buffer.concat([raw, Buffer.from(" ")]), good, "app-secret"), false, "body changed");
  assert.strictEqual(verifySignature(raw, good.replace("sha256=", "sha1="), "app-secret"), false);
  assert.strictEqual(verifySignature(raw, undefined, "app-secret"), false);
  assert.strictEqual(verifySignature(raw, good, ""), false, "no app secret configured = reject");
});

test("normalizer: text, image caption, voice note and status events", () => {
  const [text] = extractEvents(meta.textMessage("PN1", "Bei ya jezi?", { from: "255711000001", name: "Asha" }));
  assert.strictEqual(text.kind, "message");
  assert.strictEqual(text.phoneNumberId, "PN1");
  assert.match(text.dedupeKey, /^msg:wamid\./);
  assert.deepStrictEqual(
    { from: text.payload.from, name: text.payload.customerName, text: text.payload.text, type: text.payload.type },
    { from: "255711000001", name: "Asha", text: "Bei ya jezi?", type: "text" }
  );

  const [image] = extractEvents(meta.imageMessage("PN1", "Hii ipo?"));
  assert.strictEqual(image.payload.text, "Hii ipo?");
  assert.strictEqual(image.payload.media.id, "MEDIA_IMG_1");

  const [audio] = extractEvents(meta.audioMessage("PN1"));
  assert.strictEqual(audio.payload.type, "audio");
  assert.strictEqual(audio.payload.media.voice, true);
  assert.strictEqual(audio.payload.text, null);

  const [status] = extractEvents(meta.statusUpdate("PN1", "wamid.OUT1", "delivered"));
  assert.strictEqual(status.kind, "status");
  assert.strictEqual(status.dedupeKey, "status:wamid.OUT1:delivered");
  assert.strictEqual(status.payload.pricingCategory, "service");
});

test("normalizer: same Meta message twice produces the same dedupe key", () => {
  const body = meta.textMessage("PN1", "habari");
  assert.strictEqual(extractEvents(body)[0].dedupeKey, extractEvents(structuredClone(body))[0].dedupeKey);
});

test("normalizer: ignores non-WhatsApp payloads and keeps unknown fields as 'other'", () => {
  assert.deepStrictEqual(extractEvents({ object: "page", entry: [] }), []);
  assert.deepStrictEqual(extractEvents(null), []);
  const [other] = extractEvents(meta.envelope("PN1", { event: "APPROVED" }, { field: "message_template_status_update" }));
  assert.strictEqual(other.kind, "other");
  assert.strictEqual(other.payload.field, "message_template_status_update");
});

test("wa_id <-> JID keeps V1 (Baileys) conversation keys compatible", () => {
  assert.strictEqual(waIdToJid("255712345678"), "255712345678@s.whatsapp.net");
  assert.strictEqual(jidToWaId("255712345678@s.whatsapp.net"), "255712345678");
  assert.strictEqual(jidToWaId("98765432@lid"), null);
});
