const Groq = require("groq-sdk");
require("dotenv").config();

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const PRIMARY_MODEL_NAME = "llama-3.3-70b-versatile";
const VISION_MODEL_NAME = "llama-3.2-90b-vision-preview"; // For future image support

let groqClient = null;

function getGroqClient() {
	if (!GROQ_API_KEY) {
		throw new Error("Missing GROQ_API_KEY in environment.");
	}

	if (!groqClient) {
		groqClient = new Groq({ apiKey: GROQ_API_KEY });
	}

	return groqClient;
}

/**
 * Normalizes Groq/Provider errors for consistent handling.
 */
function normalizeProviderError(error) {
	const status = error?.status || error?.response?.status;

	if (status === 429) {
		return new Error("Groq API quota exceeded. Please try again later.");
	}

	return new Error(error?.message || "LLM request failed via Groq.");
}

/**
 * Core generation function using Groq.
 */
async function generateWithGroq(prompt, { temperature = 0.2, max_tokens = 1024, model = PRIMARY_MODEL_NAME } = {}) {
	try {
		const groq = getGroqClient();
		const chatCompletion = await groq.chat.completions.create({
			messages: [
				{
					role: "user",
					content: prompt,
				},
			],
			model: model,
			temperature,
			max_tokens,
			top_p: 1,
			stream: false,
			stop: null,
		});

		const output = chatCompletion.choices[0]?.message?.content || "";
		if (!output.trim()) {
			throw new Error("Groq returned an empty response.");
		}

		return output.trim();
	} catch (error) {
		throw normalizeProviderError(error);
	}
}

/**
 * Generate a farmer-friendly response (RAG pipeline).
 * Maintained name for backward compatibility with ragService.js.
 *
 * @param {string} prompt
 * @returns {Promise<string>}
 */
async function generateResponse(prompt) {
	if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
		throw new Error("generateResponse requires a non-empty prompt string.");
	}

	const farmerFriendlyPrompt = `You are an agricultural advisory assistant for farmers in Pakistan.
Answer in clear, practical, step-by-step language.
Give 4 to 6 actionable points and one caution note.
Use short bullet points or numbered points.
Translate the full text completely; do not summarize or shorten.

User request:
${prompt.trim()}`;

	return await generateWithGroq(farmerFriendlyPrompt, {
		temperature: 0.3,
		max_tokens: 2048,
	});
}

/**
 * General purpose text generation (Translation pipeline).
 * Maintained name for backward compatibility with translationService.js.
 */
async function generateText({
	systemPrompt = "",
	userPrompt,
	temperature = 0.1,
	maxOutputTokens = 1024,
}) {
	if (!userPrompt || typeof userPrompt !== "string") {
		throw new Error("generateText requires a non-empty userPrompt string.");
	}

	const mergedPrompt = systemPrompt
		? `${systemPrompt}\n\n${userPrompt}`
		: userPrompt;

	return await generateWithGroq(mergedPrompt, {
		temperature,
		max_tokens: maxOutputTokens,
	});
}

module.exports = {
	generateResponse,
	generateText,
};

