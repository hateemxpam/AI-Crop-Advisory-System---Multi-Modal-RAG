const { translateFromEnglish, translateToEnglish } = require("./translationService");
const { searchKnowledge } = require("./faissService");
const { generateResponse } = require("./llmService");

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

function buildPrompt(contextText, queryEnglish) {
	return `You are an agricultural expert.
Use the following context to answer the question.

Context:
${contextText}

Question:
${queryEnglish}

Give a clear, practical answer with 4 to 6 actionable points.
Also include one short caution note.
Do not return incomplete or one-line answers.`;
}

/**
 * Full RAG pipeline:
 * 1) Translate query to English
 * 2) Retrieve relevant context from FAISS service
 * 3) Build grounded prompt
 * 4) Generate answer with LLM
 * 5) Translate response back to original language
 *
 * @param {string} query
 * @param {string} language
 * @returns {Promise<string>} Final response in user language
 */
async function handleQuery(query, language = "en") {
	try {
		if (typeof query !== "string" || !query.trim()) {
			throw new Error("Query must be a non-empty string.");
		}

		const normalizedLanguage = typeof language === "string" ? language : "en";

		// Step 1: Translate user query to English.
		const queryEnglish = await translateToEnglish(query.trim(), normalizedLanguage);

		// Step 2: Retrieve relevant knowledge from FAISS microservice.
		const retrievedChunks = await searchKnowledge(queryEnglish);
		const contextText = Array.isArray(retrievedChunks) && retrievedChunks.length > 0
			? retrievedChunks.join("\n\n")
			: "No external context found. Use core agricultural best practices and answer safely.";

		// Step 3 + 4: Build prompt and generate grounded answer in English.
		const prompt = buildPrompt(contextText, queryEnglish);
		const answerEnglish = await generateResponse(prompt);

		// Step 5: Translate answer back to original user language.
		const finalResponse = await translateFromEnglish(answerEnglish, normalizedLanguage);
		return finalResponse;
	} catch (error) {
		console.error("[RagService] Failed to handle query.", error.message);
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
