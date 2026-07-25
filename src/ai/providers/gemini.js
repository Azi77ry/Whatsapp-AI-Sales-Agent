// Gemini provider - inafunga muunganiko wa Gemini (chat + function calling)
// nyuma ya "interface" ya kawaida inayotumiwa na provider zote (getReply, isConfigured, name)

const { genAI, isGeminiConfigured } = require("../geminiClient");
const config = require("../../config");
const { buildSystemPrompt } = require("../systemPrompt");
const { toolDefinitions, executeTool } = require("../tools");

function toGeminiHistory(rawHistory) {
  const history = rawHistory.map((m) => ({
    role: m.sender === "customer" ? "user" : "model",
    parts: [{ text: m.content }],
  }));
  // Hakikisha historia inaanza na 'user' kwa kuondoa ujumbe wowote wa 'model' ulio mwanzo
  while (history.length > 0 && history[0].role !== "user") {
    history.shift();
  }
  return history;
}

async function getReply(rawHistory, userMessage, context) {
  const model = genAI.getGenerativeModel({
    model: config.geminiModel,
    systemInstruction: buildSystemPrompt(context.contextSummary || null, context.merchant || null),
    tools: [{ functionDeclarations: toolDefinitions }],
    generationConfig: {
      maxOutputTokens: 350,
      temperature: 0.7,
    },
  });

  const chat = model.startChat({ history: toGeminiHistory(rawHistory) });
  let result = await chat.sendMessage(userMessage);

  const MAX_TOOL_ROUNDS = 5;
  let round = 0;

  while (round < MAX_TOOL_ROUNDS) {
    round += 1;
    const functionCalls = result.response.functionCalls();

    if (!functionCalls || functionCalls.length === 0) {
      const text = (result.response.text() || "").trim();
      if (!text) throw new Error("Gemini imerudisha jibu tupu");
      return text;
    }

    const functionResponseParts = [];
    for (const call of functionCalls) {
      const toolResult = await executeTool(call.name, call.args, context);
      functionResponseParts.push({
        functionResponse: { name: call.name, response: toolResult },
      });
    }

    result = await chat.sendMessage(functionResponseParts);
  }

  throw new Error("Gemini imefikia kikomo cha 'tool rounds' bila jibu la mwisho");
}

module.exports = { name: "gemini", isConfigured: isGeminiConfigured, getReply };
