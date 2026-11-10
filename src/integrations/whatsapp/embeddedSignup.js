// Meta Embedded Signup (Tech Provider onboarding) - upande wa server.
//
// Mtiririko:
//  1. Dashboard inaomba config (+ "state" iliyosainiwa, inayofungwa kwa merchant huyu)
//  2. Merchant anakamilisha popup ya Meta (FB.login na config_id) - browser inapata `code`
//     na tukio la WA_EMBEDDED_SIGNUP lenye waba_id + phone_number_id
//  3. Server: code -> access token (haiendi kamwe kwa browser)
//  4. Server: thibitisha token ina ruhusa kwa WABA hiyo (debug_token) na namba ni ya WABA hiyo
//  5. Server: subscribe app kwenye webhooks za WABA
//  6. Server: register namba kwa Cloud API (PIN ya 2-step)
//  7. Hifadhi muunganiko (connectionService.connect)
//
// ⚠️ Inahitaji idhini ya Meta (Business verification, Tech Provider, App Review ya
//    whatsapp_business_management + whatsapp_business_messaging). Imefungwa nyuma ya FEATURE_EMBEDDED_SIGNUP.

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const config = require("../../config");
const cloudApi = require("./cloudApiClient");
const connectionService = require("./connectionService");
const logger = require("../../utils/logger");

const REQUIRED_SCOPES = ["whatsapp_business_management", "whatsapp_business_messaging"];

class SignupError extends Error {
  constructor(message, status = 400, step = null) {
    super(message);
    this.name = "SignupError";
    this.status = status;
    this.step = step;
  }
}

function isEnabled() {
  const { appId, appSecret, embeddedSignupConfigId } = config.meta;
  return config.features.embeddedSignup && Boolean(appId && appSecret && embeddedSignupConfigId);
}

/** Config ya umma kwa dashboard (HAINA siri) + state iliyosainiwa kwa merchant huyu */
function getClientConfig(merchantId) {
  if (!isEnabled()) return { enabled: false };
  const state = jwt.sign(
    { merchantId: parseInt(merchantId, 10), purpose: "embedded_signup", nonce: crypto.randomBytes(8).toString("hex") },
    config.jwtSecret,
    { expiresIn: "20m" }
  );
  return {
    enabled: true,
    appId: config.meta.appId,
    configId: config.meta.embeddedSignupConfigId,
    graphApiVersion: config.meta.graphApiVersion,
    state,
  };
}

function verifyState(state, merchantId) {
  try {
    const payload = jwt.verify(state, config.jwtSecret);
    return payload.purpose === "embedded_signup" && payload.merchantId === parseInt(merchantId, 10);
  } catch (_) {
    return false;
  }
}

async function exchangeCode(code) {
  const { appId, appSecret } = config.meta;
  const data = await cloudApi.request("GET", "oauth/access_token", {
    query: { client_id: appId, client_secret: appSecret, code },
  });
  if (!data.access_token) throw new SignupError("Meta haikurudisha access token.", 502, "exchange_code");
  return { accessToken: data.access_token, expiresIn: data.expires_in || null };
}

/** Thibitisha token ni ya app yetu, ina ruhusa zinazohitajika, na inaruhusiwa kwa WABA hii */
async function validatePermissions(accessToken, wabaId) {
  const { appId, appSecret } = config.meta;
  const { data } = await cloudApi.request("GET", "debug_token", {
    query: { input_token: accessToken, access_token: `${appId}|${appSecret}` },
  });
  if (!data?.is_valid) throw new SignupError("Token si halali.", 400, "validate_token");
  if (String(data.app_id) !== String(appId)) throw new SignupError("Token si ya app hii.", 400, "validate_token");

  for (const scope of REQUIRED_SCOPES) {
    const granted = (data.granular_scopes || []).find((s) => s.scope === scope);
    if (!granted) throw new SignupError(`Ruhusa "${scope}" haikutolewa. Rudia na ukubali ruhusa zote.`, 403, "validate_scopes");
    if (Array.isArray(granted.target_ids) && granted.target_ids.length > 0 && !granted.target_ids.map(String).includes(String(wabaId))) {
      throw new SignupError("Token haina ruhusa kwa WhatsApp Business Account uliyochagua.", 403, "validate_scopes");
    }
  }
  return { scopes: (data.scopes || []).join(","), expiresAt: data.expires_at ? new Date(data.expires_at * 1000) : null };
}

async function validatePhoneBelongsToWaba(accessToken, wabaId, phoneNumberId) {
  const res = await cloudApi.request("GET", `${wabaId}/phone_numbers`, { token: accessToken });
  const found = (res.data || []).some((p) => String(p.id) === String(phoneNumberId));
  if (!found) throw new SignupError("Namba uliyochagua si ya WhatsApp Business Account hii.", 400, "validate_assets");
}

async function subscribeApp(accessToken, wabaId) {
  await cloudApi.request("POST", `${wabaId}/subscribed_apps`, { token: accessToken });
}

/** Register namba kwa Cloud API. Kama tayari imesajiliwa, Meta inarudisha kosa tunalovumilia. */
async function registerPhone(accessToken, phoneNumberId) {
  const pin = String(crypto.randomInt(0, 1e6)).padStart(6, "0");
  try {
    await cloudApi.request("POST", `${phoneNumberId}/register`, {
      token: accessToken,
      json: { messaging_product: "whatsapp", pin },
    });
    return { registered: true };
  } catch (err) {
    // Namba yenye 2-step PIN tayari (au iliyokwisha sajiliwa) - mmiliki ataweza kusajili kwa PIN yake
    logger.warn("embedded_signup.register_failed", { phoneNumberId, code: err.code, error: err.message });
    return { registered: false, warning: err.message };
  }
}

/**
 * Hatua ya mwisho: imeitwa na dashboard baada ya popup ya Meta kukamilika.
 * 🛡️ merchantId inatoka kwenye JWT ya merchant (req.merchantId) na lazima ilingane na `state`.
 */
async function complete({ merchantId, code, wabaId, phoneNumberId, businessId, state }) {
  if (!isEnabled()) throw new SignupError("Embedded Signup haijawashwa.", 404);
  if (!verifyState(state, merchantId)) throw new SignupError("Kikao cha kuunganisha kimeisha au si sahihi. Anza upya.", 400, "state");
  if (!code || !wabaId || !phoneNumberId) throw new SignupError("Taarifa kutoka Meta hazijakamilika.", 400, "input");

  let step = "exchange_code";
  try {
    const { accessToken } = await exchangeCode(code);
    step = "validate";
    const perms = await validatePermissions(accessToken, wabaId);
    await validatePhoneBelongsToWaba(accessToken, wabaId, phoneNumberId);
    step = "subscribe";
    await subscribeApp(accessToken, wabaId);
    step = "register";
    const registration = await registerPhone(accessToken, phoneNumberId);
    step = "save";
    const connection = await connectionService.connect({
      merchantId, wabaId, phoneNumberId, accessToken, businessId: businessId || null,
      tokenType: "business_integration", scopes: perms.scopes, expiresAt: perms.expiresAt,
    });
    logger.info("embedded_signup.completed", { merchantId, wabaId, phoneNumberId, registered: registration.registered });
    return { connection, warning: registration.warning || null };
  } catch (err) {
    if (err instanceof SignupError || err.name === "ConnectionError") throw err;
    logger.warn("embedded_signup.failed", { merchantId, step, code: err.code, error: err.message });
    throw new SignupError(`Imeshindwa kuunganisha (${step}): ${err.message}`, 502, step);
  }
}

module.exports = { isEnabled, getClientConfig, complete, SignupError };
