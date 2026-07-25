// callAISimple.js - Msaidizi wa pamoja wa kuita AI bila function calling.
// Unatumika na businessAdvisor.js na reEngagement.js ili kuepuka kuandika nambari mara mbili.
// Hii inajaribu providers kwa mpangilio uliowekwa kwenye config.

const { getOrderedProviders } = require("./providers");
const { genAI, isGeminiConfigured } = require("./geminiClient");
const config = require("../config");
const OpenAI = require("openai");

/**
 * Wita AI provider yoyote inayopatikana na urudishe jibu la maandishi.
 * @param {string} prompt - Ujumbe utakaotumwa kwa AI
 * @param {object} [options] - max_tokens, temperature
 * @returns {Promise<string|null>} Jibu la AI, au null kama wote wameshindwa
 */
async function callAISimple(prompt, { max_tokens = 1024, temperature = 0.4 } = {}) {
  const providers = getOrderedProviders();

  for (const provider of providers) {
    if (!provider.isConfigured()) continue;

    try {
      if (provider.name === "gemini") {
        if (!isGeminiConfigured()) continue;
        const model = genAI.getGenerativeModel({ model: config.geminiModel });
        const result = await model.generateContent(prompt);
        const text = (result.response.text() || "").trim();
        if (text) return text;
      } else {
        let apiKey, baseURL, model;

        if (provider.name === "groq") {
          apiKey = config.groqApiKey;
          baseURL = "https://api.groq.com/openai/v1";
          model = config.groqModel;
        } else if (provider.name === "qwen") {
          apiKey = config.qwenApiKey;
          baseURL = config.qwenBaseUrl;
          model = config.qwenModel;
        } else {
          continue;
        }

        const client = new OpenAI({ apiKey, baseURL });
        const resp = await client.chat.completions.create({
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens,
          temperature,
        });
        const text = (resp.choices?.[0]?.message?.content || "").trim();
        if (text) return text;
      }
    } catch (err) {
      console.warn(`⚠️  callAISimple (${provider.name}) imeshindwa: ${err.message.slice(0, 80)}`);
    }
  }

  return null;
}

module.exports = { callAISimple };
