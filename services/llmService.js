const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PRIMARY_MODEL_NAME = "gemini-2.5-flash";
const FALLBACK_MODEL_NAMES = ["gemini-2.5-pro", "gemini-2.0-flash", "gemini-flash-latest"];

let geminiClient = null;
const modelCache = new Map();

function getModel(modelName = PRIMARY_MODEL_NAME) {
	if (!GEMINI_API_KEY) {
		throw new Error("Missing GEMINI_API_KEY in environment.");
	}

	if (!geminiClient) {
		geminiClient = new GoogleGenerativeAI(GEMINI_API_KEY);
	}

	if (!modelCache.has(modelName)) {
		modelCache.set(modelName, geminiClient.getGenerativeModel({ model: modelName }));
	}

	return modelCache.get(modelName);
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

function looksIncomplete(output) {
	const text = String(output || "").trim();
	if (!text) return true;

	// Too short for advisory content is usually a sign of a cut-off response.
	if (text.length < 450) return true;

	// Common incomplete endings.
	if (/[,:;\-]$/.test(text)) return true;
	if (/\b(to|and|with|for|in|on|at|by|from)\s*$/i.test(text)) return true;
	if (!/[.!?।۔]$/.test(text)) return true;

	return false;
}

function mergeContinuation(previousText, continuationText) {
	const previous = String(previousText || "").trimEnd();
	const continuation = String(continuationText || "").trim();

	if (!previous) return continuation;
	if (!continuation) return previous;

	const maxOverlap = Math.min(previous.length, continuation.length, 240);
	let overlap = 0;

	for (let size = maxOverlap; size > 0; size--) {
		const suffix = previous.slice(-size);
		const prefix = continuation.slice(0, size);

		if (suffix === prefix) {
			overlap = size;
			break;
		}
	}

	const merged = previous + (overlap > 0 ? continuation.slice(overlap) : `\n\n${continuation}`);
	return merged.trim();
}

async function generateWithModel(prompt, { temperature = 0.2, maxOutputTokens = 512 } = {}) {
	const modelNames = [PRIMARY_MODEL_NAME, ...FALLBACK_MODEL_NAMES];
	let lastError = null;

	for (const modelName of modelNames) {
		try {
			const model = getModel(modelName);
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
		} catch (error) {
			lastError = error;
			const status = error?.status || error?.response?.status;
			const message = String(error?.message || "");
			const isTransientServiceIssue = status === 503 || /service unavailable|high demand|temporarily|try again later/i.test(message);
			if (!isTransientServiceIssue || modelName === modelNames[modelNames.length - 1]) {
				break;
			}
		}
	}

	throw lastError || new Error("LLM request failed.");
}

async function generateCompleteResponse(prompt, options = {}) {
	let combined = await generateWithModel(prompt, options);

	for (let attempt = 0; attempt < 2 && looksIncomplete(combined); attempt++) {
		const continuationPrompt = `${prompt}

The previous answer was cut off or too short. Continue from exactly where it stopped.
Do not repeat earlier text. Add only the missing continuation, and finish the answer fully.`;

		const continuation = await generateWithModel(continuationPrompt, {
			...options,
			maxOutputTokens: Math.max(options.maxOutputTokens || 0, 1400),
		});

		combined = mergeContinuation(combined, continuation);
	}

	return combined;
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
Do not start with a long introduction. Start directly with the advice.
Use short bullet points or numbered points.

User request:
${prompt.trim()}`;

		// Return clean plain text only.
		return await generateCompleteResponse(farmerFriendlyPrompt, {
			temperature: 0.2,
			maxOutputTokens: 1400,
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
		return await generateCompleteResponse(mergedPrompt, { temperature, maxOutputTokens });
	} catch (error) {
		throw normalizeProviderError(error);
	}
}

module.exports = {
	generateResponse,
	generateText,
};
