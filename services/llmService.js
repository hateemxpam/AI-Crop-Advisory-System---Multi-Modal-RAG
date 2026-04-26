const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = "gemini-2.5-flash";

let geminiClient = null;

function getModel() {
	if (!GEMINI_API_KEY) {
		throw new Error("Missing GEMINI_API_KEY in environment.");
	}

	if (!geminiClient) {
		geminiClient = new GoogleGenerativeAI(GEMINI_API_KEY);
	}

	return geminiClient.getGenerativeModel({ model: MODEL_NAME });
}

function normalizeProviderError(error) {
	const status = error?.status;

	if (status === 429) {
		return new Error("LLM quota exceeded. Please check project limits or retry later.");
	}

	if (status === 400 && /API key expired|API_KEY_INVALID/i.test(error?.message || "")) {
		return new Error("LLM API key is invalid or expired. Please update GEMINI_API_KEY.");
	}

	return new Error(error?.message || "LLM request failed.");
}

async function generateWithModel(prompt, { temperature = 0.2, maxOutputTokens = 512 } = {}) {
	const model = getModel();

	const result = await model.generateContent({
		contents: [{ role: "user", parts: [{ text: prompt }] }],
		generationConfig: {
			temperature,
			maxOutputTokens,
		},
	});

	const response = await result.response;
	const output = response.text().trim();

	if (!output) {
		throw new Error("LLM returned an empty response.");
	}

	return output;
}

/**
	* Generate a farmer-friendly response using Gemini Flash.
	*
	* @param {string} prompt
	* @returns {Promise<string>}
 */
async function generateResponse(prompt) {
	if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
		throw new Error("generateResponse requires a non-empty prompt string.");
	}

	try {
		const farmerFriendlyPrompt = `You are an agricultural advisory assistant for farmers in Pakistan.
Answer in clear, practical, step-by-step language.
Give 4 to 6 actionable points and one caution note.
Do not stop mid-sentence.

User request:
${prompt.trim()}`;

		// Return clean plain text only.
		return await generateWithModel(farmerFriendlyPrompt, {
			temperature: 0.2,
			maxOutputTokens: 700,
		});
	} catch (error) {
		throw normalizeProviderError(error);
	}
}

// Backward-compatible adapter for existing calls in current codebase.
async function generateText({
	systemPrompt = "",
	userPrompt,
	temperature = 0.2,
	maxOutputTokens = 512,
}) {
	if (!userPrompt || typeof userPrompt !== "string") {
		throw new Error("generateText requires a non-empty userPrompt string.");
	}

	const mergedPrompt = systemPrompt
		? `${systemPrompt}\n\n${userPrompt}`
		: userPrompt;

	try {
		return await generateWithModel(mergedPrompt, { temperature, maxOutputTokens });
	} catch (error) {
		throw normalizeProviderError(error);
	}
}

module.exports = {
	generateResponse,
	generateText,
};
