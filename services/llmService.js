const Groq = require("groq-sdk");
require("dotenv").config();

const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Text-only LLM for RAG advisory generation and translation.
const PRIMARY_MODEL_NAME = "llama-3.3-70b-versatile";

// Vision LLM for analysing actual crop images sent by the farmer.
// Llama 4 Scout is the current Groq multimodal model supporting image inputs.
// llama-3.2-11b-vision-preview was decommissioned (June 2026).
const VISION_MODEL_NAME = "meta-llama/llama-4-scout-17b-16e-instruct";

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
 * Normalises Groq/Provider errors for consistent handling upstream.
 */
function normalizeProviderError(error) {
	const status = error?.status || error?.response?.status;

	if (status === 429) {
		return new Error("Groq API quota exceeded. Please try again later.");
	}

	return new Error(error?.message || "LLM request failed via Groq.");
}

/**
 * Core text generation using Groq.
 * Accepts a fully-built prompt string — does NOT add any extra wrapping.
 */
async function generateWithGroq(
	prompt,
	{ temperature = 0.2, max_tokens = 3000, model = PRIMARY_MODEL_NAME } = {}
) {
	try {
		const groq = getGroqClient();
		const chatCompletion = await groq.chat.completions.create({
			messages: [
				{
					role: "user",
					content: prompt,
				},
			],
			model,
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
 *
 * FIX: Previously this function re-wrapped the already-built prompt inside
 * another system-message block, causing duplicate and conflicting instructions.
 * Now it passes the prompt straight to Groq — `buildPrompt()` in ragService.js
 * is the sole authority on structure and instructions.
 *
 * @param {string} prompt - The fully-constructed RAG prompt from ragService.buildPrompt()
 * @returns {Promise<string>}
 */
async function generateResponse(prompt) {
	if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
		throw new Error("generateResponse requires a non-empty prompt string.");
	}

	// Pass directly — no extra wrapping. ragService.buildPrompt() already
	// contains all persona, format, and context instructions.
	return await generateWithGroq(prompt, {
		temperature: 0.3,
		max_tokens: 3000,
	});
}

/**
 * General purpose text generation used by the translation pipeline.
 *
 * @param {{ systemPrompt?: string, userPrompt: string, temperature?: number, maxOutputTokens?: number }} opts
 * @returns {Promise<string>}
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

/**
 * Analyse a crop image using Groq's vision LLM.
 *
 * Sends the raw image (as a base64 data URL) along with contextual hints from
 * the local MobileNetV2 classifier. The vision model reasons visually about
 * severity, affected plant parts, and any additional observable symptoms —
 * information that a label-only classifier simply cannot provide.
 *
 * @param {Buffer}  imageBuffer   - Raw image bytes
 * @param {string}  mimeType      - e.g. "image/jpeg", "image/png", "image/webp"
 * @param {string}  detectedLabel - Label from local MobileNetV2 model (e.g. "Tomato___Early_blight")
 * @param {number}  confidence    - Confidence score from local model (0–1)
 * @returns {Promise<string>}     - Detailed visual analysis from the vision LLM
 */
async function analyzeImageWithVision(imageBuffer, mimeType, detectedLabel, confidence) {
	if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
		throw new Error("analyzeImageWithVision requires a valid image buffer.");
	}

	const groq = getGroqClient();

	// Convert buffer → base64 data URL so the vision model can read it.
	const base64Image = imageBuffer.toString("base64");
	const dataUrl = `data:${mimeType};base64,${base64Image}`;

	// Build a confidence-aware hint to guide the vision model.
	const confidencePercent = Math.round(confidence * 100);
	const labelHint =
		detectedLabel && confidence >= 0.5
			? `A local plant disease classifier has identified this with ${confidencePercent}% confidence as: "${detectedLabel}". ` +
			  `Use this as a starting reference, but rely primarily on what you can actually observe in the image.`
			: `A local classifier attempted to identify this plant but had low confidence (${confidencePercent}%). ` +
			  `Please analyse the image carefully on its own merits without relying on that label.`;

	const prompt = `You are an expert agricultural plant pathologist analysing a farmer's crop photo.

${labelHint}

Examine the image carefully and write a short plain-text assessment. Do NOT use markdown, headers, bullet points, asterisks, or any special formatting. Write in clear, simple sentences only.

Cover these five points in order, each as one or two plain sentences:
1. Visible symptoms: describe exactly what you can see (spots, lesions, wilting, discoloration, etc.)
2. Severity: state whether it is mild, moderate, or severe and estimate the percentage of the plant affected.
3. Affected parts: name which parts of the plant are visibly affected.
4. Likely cause: state the most probable disease, pest, or deficiency based on what is visible.
5. Urgency: state whether the farmer needs to act immediately or can monitor for a few days.

Be specific and factual. Only describe what is clearly visible. If the image is unclear, say so honestly. Write 5 to 8 sentences in total. No markdown. No headers. Plain sentences only.`;

	try {
		const chatCompletion = await groq.chat.completions.create({
			model: VISION_MODEL_NAME,
			messages: [
				{
					role: "user",
					content: [
						{
							type: "image_url",
							image_url: { url: dataUrl },
						},
						{
							type: "text",
							text: prompt,
						},
					],
				},
			],
			temperature: 0.2,
			max_tokens: 600,
		});

		const output = chatCompletion.choices[0]?.message?.content || "";
		if (!output.trim()) {
			throw new Error("Vision model returned an empty response.");
		}

		console.log("[LLMService] Vision analysis complete.");
		return output.trim();
	} catch (error) {
		console.error("[LLMService] Vision analysis failed:", error.message);
		// Rethrow so imageController can decide how to handle it gracefully.
		throw normalizeProviderError(error);
	}
}

module.exports = {
	generateResponse,
	generateText,
	analyzeImageWithVision,
};
