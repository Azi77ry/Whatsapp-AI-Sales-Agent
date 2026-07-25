// Registry ya AI providers zote - inatengeneza orodha kwa mpangilio wa AI_PROVIDER_ORDER
// (mfano: "gemini,groq,qwen") ili agent.js iweze kujaribu moja baada ya nyingine.

const config = require("../../config");
const geminiProvider = require("./gemini");
const { createOpenAiCompatibleProvider } = require("./openaiCompatible");

function isRealKey(key) {
  return Boolean(key) && !key.includes("xxxx") && !key.toLowerCase().includes("your-");
}

const groqProvider = createOpenAiCompatibleProvider({
  name: "groq",
  apiKey: config.groqApiKey,
  baseURL: "https://api.groq.com/openai/v1",
  model: config.groqModel,
  isConfigured: () => isRealKey(config.groqApiKey),
});

const qwenProvider = createOpenAiCompatibleProvider({
  name: "qwen",
  apiKey: config.qwenApiKey,
  baseURL: config.qwenBaseUrl,
  model: config.qwenModel,
  isConfigured: () => isRealKey(config.qwenApiKey),
});

const deepseekProvider = createOpenAiCompatibleProvider({
  name: "deepseek",
  apiKey: config.deepseekApiKey,
  baseURL: "https://api.deepseek.com", // DeepSeek standard URL
  model: config.deepseekModel,
  isConfigured: () => isRealKey(config.deepseekApiKey),
});

const togetherProvider = createOpenAiCompatibleProvider({
  name: "together",
  apiKey: config.togetherApiKey,
  baseURL: "https://api.together.xyz/v1", // Together AI standard URL
  model: config.togetherModel,
  isConfigured: () => isRealKey(config.togetherApiKey),
});

const allProviders = {
  gemini: geminiProvider,
  groq: groqProvider,
  qwen: qwenProvider,
  deepseek: deepseekProvider,
  together: togetherProvider,
};

// Inarudisha providers kwa mpangilio uliowekwa kwenye .env (AI_PROVIDER_ORDER),
// zikiwa tayari kujaribiwa moja baada ya nyingine na agent.js
function getOrderedProviders() {
  return config.aiProviderOrder.map((name) => allProviders[name]).filter(Boolean);
}

module.exports = { getOrderedProviders, allProviders };
