// Kwenye tests (NODE_ENV=test) .env haiandiki juu ya env za test - vinginevyo tests zingegusa DB ya production
// ENV_FILE inaruhusu kutumia faili lingine (mf. .env.local kwa majaribio ya hapa kwenye kompyuta)
require("dotenv").config({ path: process.env.ENV_FILE || ".env", override: process.env.NODE_ENV !== "test" });

// Angalizo: Sasa ni lazima uweke secrets hizi kwenye .env
if (!process.env.JWT_SECRET || !process.env.ENCRYPTION_KEY || !process.env.ADMIN_PASSWORD) {
  throw new Error("\n⚠️  KOSA KUBWA: Lazima uweke JWT_SECRET, ENCRYPTION_KEY, na ADMIN_PASSWORD kwenye faili la .env kwa usalama wa mfumo.\n");
}

function parseProviderOrder(raw) {
  return (raw || "gemini,groq,qwen")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

module.exports = {
  jwtSecret: process.env.JWT_SECRET,
  encryptionKey: process.env.ENCRYPTION_KEY,
  
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",

  groqApiKey: process.env.GROQ_API_KEY,
  groqModel: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",

  qwenApiKey: process.env.QWEN_API_KEY,
  qwenModel: process.env.QWEN_MODEL || "qwen-plus",
  qwenBaseUrl: process.env.QWEN_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",

  deepseekApiKey: process.env.DEEPSEEK_API_KEY,
  deepseekModel: process.env.DEEPSEEK_MODEL || "deepseek-chat",

  togetherApiKey: process.env.TOGETHER_API_KEY,
  togetherModel: process.env.TOGETHER_MODEL || "meta-llama/Llama-3-70b-chat-hf",

  // Mpangilio wa kujaribu AI providers - ya kwanza ikishindwa, inayofuata inajaribiwa
  aiProviderOrder: parseProviderOrder(process.env.AI_PROVIDER_ORDER),

  businessName: process.env.BUSINESS_NAME || "Duka Letu",
  port: process.env.PORT || 3000,
  historyLimit: parseInt(process.env.CONVERSATION_HISTORY_LIMIT || "20", 10),
  adminPassword: process.env.ADMIN_PASSWORD,

  // Context compaction - ukifikia idadi hii ya ujumbe, AI inafupisha historia
  // na kuhifadhi muhtasari badala ya kuhifadhi ujumbe wote (inasaidia kuzuia token limit)
  compactionThreshold: parseInt(process.env.COMPACTION_THRESHOLD || "15", 10),
  compactionTailSize: parseInt(process.env.COMPACTION_TAIL_SIZE || "4", 10),

  // Re-engagement cron job - kutuma nudge kwa wateja walioacha cart
  // Mteja atanudgiwa ikiwa muda wake wa mwisho ni kati ya masaa haya tangu sasa
  reEngagementMinHours: parseInt(process.env.RE_ENGAGEMENT_MIN_HOURS || "12", 10),
  reEngagementMaxHours: parseInt(process.env.RE_ENGAGEMENT_MAX_HOURS || "24", 10),
  reEngagementCooldownHours: parseInt(process.env.RE_ENGAGEMENT_COOLDOWN_HOURS || "48", 10),
  // Muda wa kutuma (masaa ya EAT, mfano: 7 hadi 21 = 7am-9pm)
  reEngagementStartHour: parseInt(process.env.RE_ENGAGEMENT_START_HOUR || "7", 10),
  reEngagementEndHour: parseInt(process.env.RE_ENGAGEMENT_END_HOUR || "21", 10),

  appUrl: process.env.APP_URL || "",

  // ── V2: Feature flags ──────────────────────────────────────────────────────
  features: {
    cloudApi: process.env.FEATURE_CLOUD_API === "true", // Webhook ya Meta + worker
    embeddedSignup: process.env.FEATURE_EMBEDDED_SIGNUP === "true", // Inasubiri idhini ya Meta
    baileys: process.env.FEATURE_BAILEYS !== "false", // Njia ya zamani (QR) - itaondolewa Phase 5 ya migration
    inProcessWorker: process.env.WEBHOOK_WORKER_IN_PROCESS !== "false", // Zima kama cPanel cron pekee inafanya kazi
  },

  // ── V2: Meta WhatsApp Cloud API ────────────────────────────────────────────
  meta: {
    appId: process.env.META_APP_ID || "",
    appSecret: process.env.META_APP_SECRET || "",
    webhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || "",
    graphApiVersion: process.env.META_GRAPH_API_VERSION || "v23.0",
    graphBaseUrl: process.env.META_GRAPH_BASE_URL || "https://graph.facebook.com",
    embeddedSignupConfigId: process.env.META_EMBEDDED_SIGNUP_CONFIG_ID || "",
  },

  // SMTP settings kwa ajili ya kureset password ya wafanyabiashara
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: parseInt(process.env.SMTP_PORT || "587", 10),
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  smtpFrom: process.env.SMTP_FROM || "no-reply@duka.com",
};
