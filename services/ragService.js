const { translateFromEnglish, translateToEnglish } = require("./translationService");
const { generateText } = require("./llmService");

async function retrieveContext(queryEnglish) {
	// Placeholder retrieval layer. Replace with vector DB retrieval later.
	return [
		"Use soil testing before fertilizer planning for wheat and rice crops.",
		"Apply nitrogen fertilizer in split doses during early and mid growth stages.",
		"Avoid over-irrigation to reduce fungal diseases and nutrient washout.",
		`User query focus: ${queryEnglish}`,
	].join("\n");
}

function buildAdvisoryPrompt(queryEnglish, context) {
	return `Given the farmer query and context below, provide practical, safe, and concise crop advice.

Farmer Query:
${queryEnglish}

Context:
${context}

Output style:
- 4 to 6 bullet points
- Include one caution note
- Keep language simple for farmers`;
}

async function answerCropQuery({ query, language }) {
	const queryEnglish = await translateToEnglish(query, language);
	const retrievedContext = await retrieveContext(queryEnglish);

	const answerEnglish = await generateText({
		systemPrompt:
			"You are an agronomy advisor focused on practical recommendations for Pakistani farmers.",
		userPrompt: buildAdvisoryPrompt(queryEnglish, retrievedContext),
		temperature: 0.2,
		maxOutputTokens: 400,
	});

	const answerLocalized = await translateFromEnglish(answerEnglish, language);

	return {
		language,
		query,
		queryEnglish,
		answer: answerLocalized,
		answerEnglish,
		retrievalContext: retrievedContext,
	};
}

module.exports = {
	answerCropQuery,
};
