// Gemini client moja inayoshirikiwa na sehemu zote za AI (customer agent + business advisor)
// Tunatoa "placeholder" kama key haipo kabisa, ili tu constructor isitupe error
// wakati wa kuanzisha app (server haipaswi ku-crash kwa sababu ya key kukosekana).

const { GoogleGenerativeAI } = require("@google/generative-ai");
const config = require("../config");

const genAI = new GoogleGenerativeAI(config.geminiApiKey || "not-configured");

function isGeminiConfigured() {
  return Boolean(config.geminiApiKey) && !config.geminiApiKey.includes("xxxx");
}

module.exports = { genAI, isGeminiConfigured };
