const { detectDisease } = require("../services/imageService");
const { analyzeImageWithVision } = require("../services/llmService");
const { handleQuery: runRagPipeline } = require("../services/ragService");
const { badRequest, internalError, ok } = require("../utils/responseHelper");
const { isValidLanguage } = require("../utils/validators");

/**
 * Handle image-based crop disease query.
 *
 * TWO-STAGE PIPELINE:
 *
 * Stage 1 — Local MobileNetV2 (fast, offline):
 *   Classify the image to get a structured { crop, disease, status, confidence }.
 *
 * Stage 2 — Groq Vision LLM (contextual, online):
 *   Pass the raw image bytes + the Stage 1 label to the vision model.
 *   The vision model reasons about what is ACTUALLY visible: severity, affected
 *   plant parts, lesion patterns, urgency — detail a label-only classifier misses.
 *
 * Stage 3 — RAG Pipeline:
 *   Use both outputs to build a rich, grounded query.
 *   FAISS retrieves relevant knowledge; the main LLM generates actionable advice.
 *
 * This replaces the previous approach where the detection label was simply
 * interpolated into a hardcoded template string, producing generic advice that
 * had nothing to do with the actual visual content of the image.
 *
 * Expects a multipart/form-data request with:
 *   - image (file)    : crop photo (JPEG/PNG/WebP, max 5 MB)
 *   - language (text) : optional, defaults to "en"
 *   - location (text) : optional city name for weather context
 */
async function handleImageQuery(req, res) {
	try {
		const file = req.file;

		if (!file) {
			return badRequest(res, "An image file is required. Please upload a crop photo.");
		}

		const language = req.body?.language || "en";
		const location = req.body?.location?.trim() || null;

		if (!isValidLanguage(language)) {
			return badRequest(res, "Field 'language' must be one of: en, ur, pa.");
		}

		// ── Stage 1: Local MobileNetV2 classification ──────────────────────────
		// Fast, offline, gives us a structured label with confidence score.
		const detection = await detectDisease(file.buffer, file.mimetype);

		console.log(
			`[ImageController] Stage 1 (Local Model): ${JSON.stringify({
				crop: detection.crop,
				disease: detection.disease,
				status: detection.status,
				confidence: `${(detection.confidence * 100).toFixed(1)}%`,
				isHighConfidence: detection.isHighConfidence,
			})}`
		);

		// ── Stage 2: Groq Vision LLM visual analysis ───────────────────────────
		// Send the raw image to the vision model for real visual reasoning.
		// This captures severity, affected parts, and observable symptoms that
		// the label-only classifier cannot provide.
		let visionAnalysis = null;
		try {
			visionAnalysis = await analyzeImageWithVision(
				file.buffer,
				file.mimetype,
				detection.rawLabel,
				detection.confidence
			);
			console.log(`[ImageController] Stage 2 (Vision LLM) complete. Analysis: "${visionAnalysis.slice(0, 120)}..."`);
		} catch (visionError) {
			// Vision analysis is enrichment — if it fails, continue with
			// the local detection result alone rather than failing the whole request.
			console.warn(
				`[ImageController] Vision LLM unavailable (${visionError.message}). ` +
				`Continuing with local detection result only.`
			);
		}

		// ── Stage 3: Build RAG query from both sources ─────────────────────────
		// Query is constructed to reflect what was actually detected and observed,
		// not just a canned string template.
		let ragQuery;

		if (detection.status === "Healthy") {
			ragQuery = detection.isHighConfidence
				? `My ${detection.crop} crop appears healthy. What are the best practices to maintain crop health and prevent common diseases?`
				: `I am checking on my crop which may be healthy. What are the best practices to maintain crop health and prevent common diseases?`;
		} else if (detection.disease && detection.disease.toLowerCase() !== "none") {
			if (detection.isHighConfidence) {
				ragQuery =
					`My ${detection.crop} crop has been identified with ${detection.disease}. ` +
					`What are the specific treatment steps, disease management practices, and fungicide or pesticide options I should use?`;
			} else {
				// Low confidence — let the vision analysis (if available) drive the query,
				// rather than asserting a possibly-wrong disease name.
				ragQuery = visionAnalysis
					? `Based on a visual inspection of my crop, the following issues have been observed: ` +
					  `${visionAnalysis}. What disease management and treatment steps should I take?`
					: `My crop appears to have some disease or abnormal symptoms. ` +
					  `What are the general disease identification and treatment steps a farmer should follow?`;
			}
		} else {
			ragQuery = `I have uploaded a photo of my crop for inspection. ` +
				`What disease symptoms should I look for and what preventive measures should I take?`;
		}

		console.log(`[ImageController] Stage 3 RAG query: "${ragQuery.slice(0, 120)}..."`);

		// ── Stage 3: Feed into RAG pipeline (FAISS + LLM) ─────────────────────
		// The vision analysis is passed separately so ragService can inject it
		// directly into the LLM prompt as visual evidence — not just as part of
		// the query string.
		const finalResponse = await runRagPipeline(ragQuery, language, location, visionAnalysis);

		return ok(res, {
			detection: {
				crop: detection.crop,
				status: detection.status,
				disease: detection.disease,
				confidence: Math.round(detection.confidence * 100),
				isHighConfidence: detection.isHighConfidence,
			},
			visionAnalysis,
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
