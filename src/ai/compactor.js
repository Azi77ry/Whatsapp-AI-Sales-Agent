// Compactor - inafupisha historia ndefu ya mazungumzo kuwa muhtasari mfupi wa Kiswahili.
// Hutumiwa na agent.js wakati ujumbe unafika kiwango cha compactionThreshold.
// Inajaribu providers zote kwa mpangilio (Gemini → Groq → Qwen) - si Gemini peke yake.
// Ikiwa zote zimeshindwa, compaction inarukwa kimya kimya (haina athari mbaya).

const { genAI, isGeminiConfigured } = require("./geminiClient");
const { getOrderedProviders } = require("./providers");
const config = require("../config");
const OpenAI = require("openai");

const COMPACTION_PROMPT = (historyText) =>
  `Soma mazungumzo haya kati ya mteja na AI sales agent. Andika muhtasari MFUPI wa sentensi 1-3 kwa Kiswahili.
Lengo la muhtasari huu ni kumjulisha mmiliki wa duka MUELEKEO (intent) wa mteja.

Zingatia haya:
1. Mteja anaulizia nini au anataka nini? (Taja bidhaa, rangi, size kama ipo).
2. Kama ameweka oda au ombi maalum, taja namba ya oda na bidhaa husika.
3. Kama bado hajaweka oda, eleza anaelekea wapi (mfano: "Mteja anaulizia bei ya jezi lakini bado hajaamua").

MUHIMU SANA: Usiseme "Mteja hajatoa taarifa za kutosha". Badala yake, fupisha kile ambacho wameongea mpaka sasa. Andika kwa ufupi sana.

MAZUNGUMZO:
${historyText}

MUHTASARI:`;

// Jaribu Gemini kwanza (haraka na rahisi)
async function tryGemini(prompt) {
  if (!isGeminiConfigured()) return null;
  const model = genAI.getGenerativeModel({ model: config.geminiModel });
  const result = await model.generateContent(prompt);
  return (result.response.text() || "").trim() || null;
}

// Jaribu provider ya OpenAI-compatible (Groq, Qwen, DeepSeek, Together)
async function tryOpenAiProvider(provider, prompt) {
  let apiKey, baseURL, model;
  if (provider.name === "groq") {
    apiKey = config.groqApiKey;
    baseURL = "https://api.groq.com/openai/v1";
    model = config.groqModel;
  } else if (provider.name === "qwen") {
    apiKey = config.qwenApiKey;
    baseURL = config.qwenBaseUrl;
    model = config.qwenModel;
  } else if (provider.name === "deepseek") {
    apiKey = config.deepseekApiKey;
    baseURL = "https://api.deepseek.com/v1";
    model = config.deepseekModel;
  } else if (provider.name === "together") {
    apiKey = config.togetherApiKey;
    baseURL = "https://api.together.xyz/v1";
    model = config.togetherModel;
  } else {
    return null;
  }

  const client = new OpenAI({ apiKey, baseURL });
  const response = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    max_tokens: 150,
    temperature: 0.3,
  });
  return (response.choices?.[0]?.message?.content || "").trim() || null;
}

/**
 * Toa muhtasari mfupi wa mteja kutoka historia ya mazungumzo.
 * Inajaribu providers zote kwa mpangilio hadi moja ifanikiwe.
 * @param {Array<{sender: string, content: string}>} rawHistory
 * @param {string|null} customerName
 * @returns {Promise<string|null>}
 */
async function compactConversation(rawHistory, customerName) {
  if (!rawHistory || rawHistory.length === 0) return null;

  const historyText = rawHistory
    .map((m) => `${m.sender === "customer" ? "Mteja" : "AI"}: ${m.content}`)
    .join("\n");

  const prompt = COMPACTION_PROMPT(historyText);
  const providers = getOrderedProviders();

  for (const provider of providers) {
    if (!provider.isConfigured()) continue;
    try {
      let summary = null;
      if (provider.name === "gemini") {
        summary = await tryGemini(prompt);
      } else {
        summary = await tryOpenAiProvider(provider, prompt);
      }
      if (summary) {
        console.log(`📝 Compaction (${provider.name}): ${summary}`);
        return summary;
      }
    } catch (err) {
      console.warn(`⚠️  Compaction imeshindwa (${provider.name}): ${err.message.slice(0, 80)}...`);
      // endelea kwa provider inayofuata
    }
  }

  console.warn("⚠️  Compaction: Providers zote zimeshindwa, inaendelea bila muhtasari.");
  return null;
}

module.exports = { compactConversation };
