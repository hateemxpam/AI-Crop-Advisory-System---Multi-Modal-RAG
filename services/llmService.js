const { GoogleGenerativeAI } = require("@google/generative-ai");
const config = require("../config");

let geminiClient = null;

function getGeminiModel() {
	if (!config.llm.apiKey) {
		throw new Error("Missing GEMINI_API_KEY in environment.");
	}

	if (!geminiClient) {
		geminiClient = new GoogleGenerativeAI(config.llm.apiKey);
	}

	return geminiClient.getGenerativeModel({ model: config.llm.model });
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

/**
 * Provider-agnostic text generation entry point.
 * Keep all vendor-specific API logic inside this file only.
 */
async function generateText({
	systemPrompt = "",
	userPrompt,
	temperature = config.llm.temperature,
	maxOutputTokens = config.llm.maxOutputTokens,
}) {
	if (!userPrompt || typeof userPrompt !== "string") {
		throw new Error("generateText requires a non-empty userPrompt string.");
	}

	try {
		if (config.llm.provider === "gemini") {
			const model = getGeminiModel();

			const prompt = systemPrompt
				? `${systemPrompt}\n\n${userPrompt}`
				: userPrompt;

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

		throw new Error(
			`Unsupported LLM provider: ${config.llm.provider}. Update services/llmService.js to add support.`
		);
	} catch (error) {
		throw normalizeProviderError(error);
	}
}

module.exports = {
	generateText,
};
