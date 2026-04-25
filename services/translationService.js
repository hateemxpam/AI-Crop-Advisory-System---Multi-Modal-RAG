/**
 * translationService.js
 *
 * PURPOSE:
 * This service handles language translation as part of the RAG (Retrieval-Augmented
 * Generation) pipeline for the AI Crop Advisory System.
 *
 * WHY TRANSLATION IS NEEDED:
 * Pakistani farmers (the primary users) may query the system in Urdu or Punjabi.
 * However, all internal processing — vector similarity search, document retrieval,
 * and LLM response generation — operates in English for accuracy and model performance.
 *
 * WHERE IT FITS IN THE PIPELINE:
 *
 *   [User Query (Urdu/Punjabi/English)]
 *          ↓
 *   [translateToEnglish]       ← THIS SERVICE (Step 1)
 *          ↓
 *   [Embedding + Vector Search]
 *          ↓
 *   [LLM generates English response]
 *          ↓
 *   [translateFromEnglish]     ← THIS SERVICE (Step 2)
 *          ↓
 *   [Response returned to user in their language]
 */

const { generateText } = require("./llmService");

/**
 * Normalizes Urdu/Punjabi script output to avoid character-split rendering.
 * Some model outputs may occasionally contain accidental spacing between letters.
 */
function normalizeUrduPunjabiText(text) {
  if (!text) return text;

  const tokens = String(text)
    .normalize("NFC")
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ");

  const isSingleArabicLetter = (token) => /^[\u0600-\u06FF]$/.test(token);
  const normalizedTokens = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (!isSingleArabicLetter(token)) {
      normalizedTokens.push(token);
      continue;
    }

    const run = [token];
    let j = i + 1;
    while (j < tokens.length && isSingleArabicLetter(tokens[j])) {
      run.push(tokens[j]);
      j++;
    }

    // Join only clear letter-fragment runs to avoid changing normal short tokens.
    if (run.length >= 3) {
      normalizedTokens.push(run.join(""));
    } else {
      normalizedTokens.push(...run);
    }

    i = j - 1;
  }

  return normalizedTokens
    .join(" ")
    .replace(/\s+([،۔!?])/g, "$1")
    .trim();
}

// ─────────────────────────────────────────────────────────────────
// FUNCTION 1: translateToEnglish
// ─────────────────────────────────────────────────────────────────

/**
 * Translates user input to English.
 *
 * Called at the START of the RAG pipeline, right after receiving the user query.
 * Converts Urdu or Punjabi queries to English so the embedding model and
 * retriever can perform accurate similarity search against the English knowledge base.
 *
 * @param {string} text       - The text to translate (user's query)
 * @param {string} sourceLang - Language code of the input: "en", "ur" (Urdu), "pa" (Punjabi)
 * @returns {Promise<string>} - The English version of the text, or a fallback message on error
 */
async function translateToEnglish(text, sourceLang) {
  // If the source is already English, skip the API call entirely — saves latency and quota
  if (sourceLang === "en") {
    return text;
  }

  // Map language codes to human-readable names for cleaner prompts
  const langNames = {
    ur: "Urdu",
    pa: "Punjabi",
  };

  const sourceLanguageName = langNames[sourceLang] || sourceLang;

  // Prompt is designed to be strict:
  // - Specifies source language explicitly to help the model, even if it could auto-detect
  // - "Only return the translated text" prevents the model from adding explanations
  // - "Keep meaning accurate and simple" preserves agricultural terminology correctly
  const prompt = `Translate the following ${sourceLanguageName} text to English. Keep meaning accurate and simple. Only return the translated text, with no explanation or extra commentary.

Text: ${text}`;

  try {
    const translated = await generateText({
      systemPrompt: "You are a professional translator for agricultural support.",
      userPrompt: prompt,
      temperature: 0.1,
      maxOutputTokens: 256,
    });
    console.log(
      `[TranslationService] Translated (${sourceLang} → en): "${text}" → "${translated}"`
    );
    return translated;
  } catch (error) {
    console.error(
      `[TranslationService] Failed to translate to English. Source: "${text}"`,
      error.message
    );
    // Fallback: return a safe message so the pipeline doesn't crash.
    // The RAG pipeline should handle this case (e.g., log + surface to user).
    return "Translation unavailable. Please try again or rephrase your query in English.";
  }
}

// ─────────────────────────────────────────────────────────────────
// FUNCTION 2: translateFromEnglish
// ─────────────────────────────────────────────────────────────────

/**
 * Translates an English response back to the user's language.
 *
 * Called at the END of the RAG pipeline, after the LLM has generated its
 * English response. Converts the advisory text back to Urdu or Punjabi
 * so the farmer receives the answer in their preferred language.
 *
 * @param {string} text       - The English text to translate (LLM response)
 * @param {string} targetLang - Language code for the output: "en", "ur" (Urdu), "pa" (Punjabi)
 * @returns {Promise<string>} - The translated text in the target language, or fallback on error
 */
async function translateFromEnglish(text, targetLang) {
  // If the target is English, no translation is needed — return immediately
  if (targetLang === "en") {
    return text;
  }

  const langNames = {
    ur: "Urdu",
    pa: "Punjabi",
  };

  const targetLanguageName = langNames[targetLang] || targetLang;

  // Prompt notes:
  // - We specify "from English" explicitly for precision
  // - Agricultural advice must be clear and culturally appropriate
  // - "Only return the translated text" keeps the output clean for display in the UI
  const prompt = `Translate the following English text to ${targetLanguageName}. The text is agricultural advice for farmers. Keep the meaning accurate, clear, and culturally appropriate. Use natural, properly joined words in ${targetLanguageName} script (do not space out individual letters). Only return the translated text, with no explanation or extra commentary.

Text: ${text}`;

  try {
    const translatedRaw = await generateText({
      systemPrompt: "You are a professional translator for agricultural support.",
      userPrompt: prompt,
      temperature: 0.1,
      maxOutputTokens: 512,
    });
    const translated =
      targetLang === "ur" || targetLang === "pa"
        ? normalizeUrduPunjabiText(translatedRaw)
        : translatedRaw;
    console.log(
      `[TranslationService] Translated (en → ${targetLang}): "${text.slice(0, 60)}..." → "${translated.slice(0, 60)}..."`
    );
    return translated;
  } catch (error) {
    console.error(
      `[TranslationService] Failed to translate from English. Target lang: ${targetLang}`,
      error.message
    );
    // Fallback: return the original English text so the user still receives useful info.
    // This is preferable to returning nothing or crashing the response pipeline.
    return text;
  }
}

// Export both functions for use in the RAG pipeline controller
module.exports = {
  translateToEnglish,
  translateFromEnglish,
};
