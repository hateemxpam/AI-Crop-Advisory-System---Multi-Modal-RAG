const { translateFromEnglish, translateToEnglish } = require("./translationService");
const { searchKnowledge } = require("./faissService");
const { generateResponse } = require("./llmService");
const { getWeather } = require("./weatherService");

// ─────────────────────────────────────────────────────────────────
// In-memory response cache
// Stores: cacheKey → { response: string, expiresAt: number }
// Avoids repeated translation + FAISS + LLM calls for identical queries.
// ─────────────────────────────────────────────────────────────────
const responseCache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Build a deterministic cache key from the query inputs.
 * Location is excluded — weather changes so we never cache location-based queries.
 */
function buildCacheKey(query, language) {
	return `${language}::${query.trim().toLowerCase()}`;
}

/**
 * Retrieve a cached response if it exists and hasn't expired.
 * @returns {string|null}
 */
function getCached(key) {
	const entry = responseCache.get(key);
	if (!entry) return null;
	if (Date.now() > entry.expiresAt) {
		responseCache.delete(key); // Evict stale entry
		return null;
	}
	return entry.response;
}

/**
 * Store a response in the cache.
 */
function setCached(key, response) {
	responseCache.set(key, {
		response,
		expiresAt: Date.now() + CACHE_TTL_MS,
	});
}

function buildUserErrorMessage(language, errorMessage) {
	const normalized = String(errorMessage || "").toLowerCase();
	const isQuotaIssue = normalized.includes("quota") || normalized.includes("429");

	if (!isQuotaIssue) {
		if (language === "ur") {
			return "معذرت، اس وقت آپ کی درخواست پر کارروائی نہیں ہو سکی۔ براہِ کرم دوبارہ کوشش کریں۔";
		}

		if (language === "pa") {
			return "معاف کرنا، اس ویلے درخواست پوری نہیں ہو سکی۔ مہربانی کرکے دوبارہ کوشش کرو۔";
		}

		return "Sorry, I could not process your request right now. Please try again.";
	}

	if (language === "ur") {
		return "اس وقت AI سروس کی روزانہ حد پوری ہو گئی ہے۔ براہِ کرم کچھ دیر بعد دوبارہ کوشش کریں۔";
	}

	if (language === "pa") {
		return "اس ویلے AI سروس دی روزانہ حد پوری ہو گئی اے۔ تھوڑی دیر بعد دوبارہ کوشش کرو۔";
	}

	return "AI service quota is reached right now. Please try again later.";
}

/**
 * Build the LLM prompt, optionally injecting real-time weather context.
 * Uses a strict structured format to produce clean, farmer-friendly output.
 *
 * @param {string} contextText       - Retrieved FAISS knowledge chunks
 * @param {string} queryEnglish      - User query translated to English
 * @param {{ temperature: number, condition: string, humidity: number } | null} weather
 */
function buildPrompt(contextText, queryEnglish, weather = null) {
	// Build weather section — only included when real data is available.
	const weatherSection = weather
		? `Weather:
Temperature: ${weather.temperature}°C | Condition: ${weather.condition} | Humidity: ${weather.humidity}%`
		: "Weather:\nNot available.";

	return `You are an expert agricultural advisor helping farmers in Pakistan.
Use the provided context and weather information to give clear, practical advice.

Instructions:
- Keep language simple and easy to understand
- Be concise — avoid long paragraphs
- Focus only on actionable steps the farmer can take
- Reference weather conditions where relevant (e.g. if it is raining, advise against spraying)
- Do NOT add any explanation or text outside the format below

Format your answer STRICTLY as:

🌾 Problem:
<brief 1-2 sentence explanation of what the issue is>

💡 Solution:
- Step 1: <clear action>
- Step 2: <clear action>
- Step 3: <clear action>
- Step 4: <clear action>

⚠️ Precautions:
- <important warning or note>
- <important warning or note>

---

Context:
${contextText}

${weatherSection}

Question:
${queryEnglish}`;
}

function buildContextFallback(contextText, queryEnglish) {
	const rawSentences = String(contextText || "")
		.replace(/\s+/g, " ")
		.split(/(?<=[.!?])\s+/)
		.map((sentence) => sentence.trim())
		.filter(Boolean);

	const uniqueSentences = [];
	for (const sentence of rawSentences) {
		if (!uniqueSentences.includes(sentence)) {
			uniqueSentences.push(sentence);
		}
		if (uniqueSentences.length >= 5) break;
	}

	const intro = `Here is practical advice for your question about ${queryEnglish.trim()}:`;
	const bullets = uniqueSentences.length > 0
		? uniqueSentences.map((sentence, index) => `${index + 1}. ${sentence}`)
		: [
			"1. Keep the field well drained so roots do not stay in standing water.",
			"2. Watch the crop daily for fungal spots, wilting, and pest damage.",
			"3. Apply fertilizer only according to crop stage and soil condition.",
			"4. Remove diseased leaves and use clean tools to avoid spreading infection.",
			"5. Harvest and store produce carefully during dry weather whenever possible.",
		];

	return `${intro}\n\n${bullets.join("\n")}\n\nCaution: avoid waterlogging, and do not spray or fertilize heavily during continuous rain.`;
}

/**
 * Full RAG pipeline:
 * 1) Translate query to English
 * 2) Fetch weather data if location is provided (non-blocking)
 * 3) Retrieve relevant context from FAISS service
 * 4) Build grounded prompt (with optional weather context)
 * 5) Generate answer with LLM
 * 6) Translate response back to original language
 *
 * @param {string} query
 * @param {string} language
 * @param {string} [location]  - Optional city name for weather-aware advice
 * @returns {Promise<string>}  Final response in user language
 */
async function handleQuery(query, language = "en", location = null) {
	let queryEnglish = "";
	let contextText = "";

	try {
		if (typeof query !== "string" || !query.trim()) {
			throw new Error("Query must be a non-empty string.");
		}

		const normalizedLanguage = typeof language === "string" ? language : "en";

		// Cache lookup — only for queries WITHOUT a location.
		// Location-based queries include live weather so we never cache them.
		if (!location) {
			const cacheKey = buildCacheKey(query, normalizedLanguage);
			const cached = getCached(cacheKey);
			if (cached) {
				console.log(`[RagService] Cache HIT for key: "${cacheKey}"`);
				return cached;
			}
		}

		// Step 1: Translate user query to English.
		queryEnglish = await translateToEnglish(query.trim(), normalizedLanguage);

		// Step 2: Fetch weather data if location was provided.
		// getWeather() always returns null on failure — never throws — so this
		// is completely non-blocking. The pipeline continues even without weather.
		const weather = location ? await getWeather(location) : null;
		if (weather) {
			console.log(`[RagService] Weather context for "${location}": ${weather.temperature}°C, ${weather.condition}, ${weather.humidity}% humidity`);
		} else if (location) {
			console.warn(`[RagService] Could not fetch weather for "${location}". Continuing without weather context.`);
		}

		// Step 3: Retrieve relevant knowledge from FAISS microservice.
		const retrievedChunks = await searchKnowledge(queryEnglish);
		contextText = Array.isArray(retrievedChunks) && retrievedChunks.length > 0
			? retrievedChunks.join("\n\n")
			: "No external context found. Use core agricultural best practices and answer safely.";

		// Step 4 + 5: Build weather-aware prompt and generate grounded answer in English.
		const prompt = buildPrompt(contextText, queryEnglish, weather);
		const answerEnglish = await generateResponse(prompt);

		// Step 6: Translate answer back to original user language.
		const finalResponse = await translateFromEnglish(answerEnglish, normalizedLanguage);

		// Store in cache (only when no location was used).
		if (!location) {
			const cacheKey = buildCacheKey(query, normalizedLanguage);
			setCached(cacheKey, finalResponse);
			console.log(`[RagService] Cache SET for key: "${cacheKey}" (TTL: 30min)`);
		}

		return finalResponse;
	} catch (error) {
		console.error("[RagService] Failed to handle query.", error.message);
		const normalized = String(error?.message || "").toLowerCase();
		const isQuotaOrServiceIssue =
			normalized.includes("quota") ||
			normalized.includes("429") ||
			normalized.includes("503") ||
			normalized.includes("service unavailable") ||
			normalized.includes("high demand");

		if (isQuotaOrServiceIssue) {
			return buildContextFallback(contextText, queryEnglish || query);
		}

		return buildUserErrorMessage(language, error.message);
	}
}

// Backward-compatible adapter for current controller flow.
async function answerCropQuery({ query, language = "en" }) {
	const answer = await handleQuery(query, language);

	return {
		language,
		query,
		answer,
	};
}

module.exports = {
	handleQuery,
	answerCropQuery,
};
