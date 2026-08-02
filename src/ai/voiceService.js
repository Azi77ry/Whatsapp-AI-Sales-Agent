const { EdgeTTS } = require("node-edge-tts");
const { getAudioBase64 } = require("google-tts-api");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const OpenAI = require("openai");
const config = require("../config");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Kubadilisha Sauti (Voice Note) ya mteja kuwa Maandishi (Speech-to-Text)
 */
async function speechToText(audioBuffer, mimeType = "audio/ogg") {
  try {
    // 1. Jaribu kutumia Gemini Audio API kama ipo
    if (config.geminiApiKey) {
      try {
        const genAI = new GoogleGenerativeAI(config.geminiApiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        const audioPart = {
          inlineData: {
            data: audioBuffer.toString("base64"),
            mimeType: mimeType.split(";")[0] || "audio/ogg"
          }
        };

        const result = await model.generateContent([
          "Tafadhali listening kwa makini sauti hii kisha andika maneno yote yaliyosemwa (Transcription) kwa usahihi kwa lugha iliyosemwa (Kiswahili au Kiingereza). Usiongeze maelezo mengine, andika tu maneno yaliyosemwa:",
          audioPart
        ]);

        const text = result.response.text().trim();
        if (text && text.length > 0) {
          console.log(`🎙️ [STT Gemini] Voice transcribed: "${text}"`);
          return text;
        }
      } catch (geminiErr) {
        console.warn("⚠️ STT na Gemini imeshindwa, inajaribu OpenAI Whisper...", geminiErr.message);
      }
    }

    // 2. Jaribu kutumia OpenAI / Groq Whisper API kama ipo
    const apiKey = config.groqApiKey || config.openaiApiKey;
    const baseURL = config.groqApiKey ? "https://api.groq.com/openai/v1" : undefined;

    if (apiKey) {
      const openai = new OpenAI({ apiKey, baseURL });
      
      // Hifadhi sauti kwenye tmp file ili kuipasa kwa OpenAI client
      const tmpFilePath = path.join(os.tmpdir(), `voice_${Date.now()}.ogg`);
      fs.writeFileSync(tmpFilePath, audioBuffer);

      try {
        const transcription = await openai.audio.transcriptions.create({
          file: fs.createReadStream(tmpFilePath),
          model: config.groqApiKey ? "whisper-large-v3-turbo" : "whisper-1",
          language: "sw" // Inasaidia Kiswahili na Kiingereza
        });

        fs.unlinkSync(tmpFilePath); // Safisha tmp file
        if (transcription && transcription.text) {
          console.log(`🎙️ [STT Whisper] Voice transcribed: "${transcription.text}"`);
          return transcription.text.trim();
        }
      } catch (whisperErr) {
        if (fs.existsSync(tmpFilePath)) fs.unlinkSync(tmpFilePath);
        console.error("⚠️ STT na Whisper imeshindwa:", whisperErr.message);
      }
    }

    throw new Error("Hakuna huduma ya Speech-to-Text iliyo tayari kwenye usanidi wa API keys.");
  } catch (err) {
    console.error("❌ Kosa wakati wa Speech-to-Text (STT):", err.message);
    throw err;
  }
}

/**
 * Kubadilisha Jibu la Maandishi kuwa Sauti (Text-to-Speech) ya Kijana (sw-TZ-DaudiNeural)
 */
async function textToSpeech(text, lang = "sw") {
  try {
    const cleanText = text
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
      .replace(/[*_~`#]/g, '')
      .trim();

    const shortText = cleanText.length > 300 ? cleanText.slice(0, 297) + "..." : cleanText;

    // 1. Jaribu Microsoft Edge Neural TTS (sw-TZ-DaudiNeural: Sauti ya Kijana, Safi na Asili)
    try {
      const voice = lang === "sw" ? "sw-TZ-DaudiNeural" : "en-US-ChristopherNeural";
      const tts = new EdgeTTS({ voice, lang: lang === "sw" ? "sw-TZ" : "en-US" });
      const tmpFile = path.join(os.tmpdir(), `tts_${Date.now()}.mp3`);
      await tts.ttsPromise(shortText, tmpFile);
      
      const audioBuffer = fs.readFileSync(tmpFile);
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      
      if (audioBuffer && audioBuffer.length > 0) {
        console.log(`🔊 [EdgeTTS Neural] Swahili young voice generated (${audioBuffer.length} bytes)`);
        return audioBuffer;
      }
    } catch (edgeErr) {
      console.warn("⚠️ EdgeTTS imeshindwa, inajaribu Google TTS...", edgeErr.message);
    }

    // 2. Fallback: Google TTS
    const base64Audio = await getAudioBase64(shortText, {
      lang: lang === "sw" ? "sw" : "en",
      slow: false,
      host: "https://translate.google.com",
      timeout: 10000,
    });

    const audioBuffer = Buffer.from(base64Audio, "base64");
    console.log(`🔊 [TTS Google] Voice audio generated (${audioBuffer.length} bytes)`);
    return audioBuffer;
  } catch (err) {
    console.error("❌ Kosa wakati wa Text-to-Speech (TTS):", err.message);
    return null;
  }
}

module.exports = {
  speechToText,
  textToSpeech
};
