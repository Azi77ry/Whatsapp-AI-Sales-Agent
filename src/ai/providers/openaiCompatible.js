// Provider ya "generic" kwa API yoyote inayofuata muundo wa OpenAI (chat completions + function calling).
// Groq na Qwen (DashScope) zote mbili zinatoa "OpenAI-compatible endpoint", kwa hiyo
// tunatumia injini hii hii kwa zote mbili - tofauti ni tu apiKey, baseURL, na model.

const OpenAI = require("openai");
const { buildSystemPrompt } = require("../systemPrompt");
const { toolDefinitions, executeTool } = require("../tools");

// Gemini's SchemaType values ni "object", "string" n.k (maneno madogo ya kawaida),
// ambayo ni sawa kabisa na muundo wa JSON Schema unaotumiwa na OpenAI - kwa hiyo
// tunatumia hizo hizo `parameters` bila kuzibadilisha, tunazibadilisha tu muundo wa nje.
function toOpenAiTools() {
  return toolDefinitions.map((d) => ({
    type: "function",
    function: { name: d.name, description: d.description, parameters: d.parameters },
  }));
}

function toOpenAiHistory(rawHistory) {
  return rawHistory.map((m) => ({
    role: m.sender === "customer" ? "user" : "assistant",
    content: m.content,
  }));
}

function normalizeToolCallArgs(functionName, args) {
  if (typeof args !== "object" || args === null) return args;

  const integerFields = ["quantity"];
  const numberFields = ["estimatedPrice", "price", "unitPrice"];

  for (const key of Object.keys(args)) {
    if (integerFields.includes(key)) {
      if (typeof args[key] === "string") {
        const val = parseInt(args[key], 10);
        if (!isNaN(val)) args[key] = val;
      }
    } else if (numberFields.includes(key)) {
      if (typeof args[key] === "string") {
        const val = parseFloat(args[key]);
        if (!isNaN(val)) args[key] = val;
      }
    }
  }
  return args;
}

function createOpenAiCompatibleProvider({ name, apiKey, baseURL, model, isConfigured }) {
  // "placeholder" endapo key haipo, ili constructor isitupe error wakati wa kuanzisha app
  const client = new OpenAI({ apiKey: apiKey || "not-configured", baseURL });

  async function getReply(rawHistory, userMessage, context) {
    const messages = [
      { role: "system", content: buildSystemPrompt(context.contextSummary || null, context.merchant || null) },
      ...toOpenAiHistory(rawHistory),
      { role: "user", content: userMessage },
    ];

    const tools = toOpenAiTools();
    const MAX_TOOL_ROUNDS = 5;
    let round = 0;

    while (round < MAX_TOOL_ROUNDS) {
      round += 1;

      const response = await client.chat.completions.create({
        model,
        messages,
        tools,
        tool_choice: "auto",
        max_tokens: 350,
        temperature: 0.7,
      });

      const choice = response.choices[0];

      // Ikiwa model imeandika msimbo wa text wa tool call (<function=...> na </function>)
      // badala ya kuita API ya native tool, tunaisasisha kuwa toolCall ya kawaida.
      const textContent = choice.message.content || "";
      const regex = /<function=(\w+)([\s\S]*?)<\/function>/;
      const textMatch = textContent.match(regex);
      if (textMatch) {
        const toolName = textMatch[1];
        const toolArgs = textMatch[2].trim();
        choice.message.tool_calls = [{
          id: "call_" + Math.random().toString(36).substr(2, 9),
          type: "function",
          function: {
            name: toolName,
            arguments: toolArgs
          }
        }];
        // Safisha content ili tusiwatumie wateja msimbo huu mbichi kwenye WhatsApp
        choice.message.content = textContent.replace(regex, "").trim();
      }

      const toolCalls = choice.message.tool_calls;

      if (!toolCalls || toolCalls.length === 0) {
        const text = (choice.message.content || "").trim();
        if (!text) throw new Error(`${name} imerudisha jibu tupu`);
        return text;
      }

      messages.push(choice.message);

      for (const call of toolCalls) {
        let args = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch (e) {
          args = {};
        }

        // Normalize argument types and save back to call.function.arguments
        args = normalizeToolCallArgs(call.function.name, args);
        call.function.arguments = JSON.stringify(args);

        const toolResult = await executeTool(call.function.name, args, context);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(toolResult),
        });
      }
    }

    throw new Error(`${name} imefikia kikomo cha 'tool rounds' bila jibu la mwisho`);
  }

  return { name, isConfigured, getReply };
}

module.exports = { createOpenAiCompatibleProvider };
