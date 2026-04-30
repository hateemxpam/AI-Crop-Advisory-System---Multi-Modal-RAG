const { detectDisease } = require("../services/imageService");
const { handleQuery: runRagPipeline } = require("../services/ragService");
const { badRequest, internalError, ok } = require("../utils/responseHelper");
const { isValidLanguage } = require("../utils/validators");

/**
 * Handle image-based crop disease query.
 *
 * FLOW:
 * 1. Validate the uploaded image and language.
 * 2. Send image to imageService.detectDisease() → gets { crop, status, disease }.
 * 3. Build a natural language query from the detection result.
 * 4. Feed that query into the existing RAG pipeline (FAISS + LLM).
 * 5. Return the grounded advisory response to the user.
 *
 * This approach reuses the existing knowledge base instead of relying
 * solely on the vision model for treatment advice.
 *
 * Expects a multipart/form-data request with:
 *   - image (file)        : the crop photo (JPEG/PNG/WebP, max 5MB)
 *   - language (text)     : optional, defaults to "en"
 */
async function handleImageQuery(req, res) {
	try {
		const file = req.file;

		if (!file) {
			return badRequest(res, "An image file is required. Please upload a crop photo.");
		}

		const language = req.body?.language || "en";

		if (!isValidLanguage(language)) {
			return badRequest(res, "Field 'language' must be one of: en, ur, pa.");
		}

		// Step 1: Detect the disease from the uploaded image.
		const detection = await detectDisease(file.buffer, file.mimetype);

		// Step 2: Build a query for the RAG pipeline based on detection results.
		let ragQuery;

		if (detection.disease && detection.disease.toLowerCase() !== "none") {
			// Disease detected — ask the RAG pipeline for treatment advice.
			ragQuery = `My ${detection.crop} crop has ${detection.disease}. What treatment should I apply and how can I manage this disease?`;
		} else {
			// Crop looks healthy — ask for general care advice.
			ragQuery = `My ${detection.crop} crop looks healthy. What are the best practices to keep it healthy and prevent common diseases?`;
		}

		console.log(`[ImageController] Detection: ${JSON.stringify(detection)}`);
		console.log(`[ImageController] RAG query: "${ragQuery}"`);

		// Step 3: Feed the query into the existing RAG pipeline.
		// This will: search FAISS → build prompt with context → generate response → translate.
		const finalResponse = await runRagPipeline(ragQuery, language);

		return ok(res, {
			detection,
			response: finalResponse,
		});
	} catch (error) {
		console.error("[ImageController] Failed to process image query.", error.message);
		return internalError(res, "Failed to process image query.", error.message);
	}
}

module.exports = {
	handleImageQuery,
};
