/**
 * imageService.js
 *
 * Sends the uploaded image to the local Python AI service (localhost:8000)
 * which runs the HuggingFace MobileNetV2 plant disease model fully offline.
 *
 * Returns the raw model result with confidence score.
 * The controller decides how to handle low-confidence predictions.
 */

const axios = require("axios");

const PRIMARY_URL  = "http://127.0.0.1:8000/analyze-image";
const FALLBACK_URL = "http://localhost:8000/analyze-image"; // Windows DNS fallback

// Minimum confidence required to treat the model's label as reliable.
// Below this threshold the detection is flagged as "uncertain" so downstream
// code can adjust the query and response accordingly.
const CONFIDENCE_THRESHOLD = 0.50;

/**
 * Detect crop disease by running the MobileNetV2 model locally.
 *
 * @param {Buffer} imageBuffer  - Raw image bytes from the uploaded file
 * @param {string} mimeType     - MIME type (e.g. "image/jpeg", "image/png")
 * @returns {Promise<{
 *   crop: string,
 *   status: string,
 *   disease: string,
 *   confidence: number,
 *   isHighConfidence: boolean,
 *   rawLabel: string
 * }>}
 * @throws {Error} if the Python AI service is unreachable or returns an error
 */
async function detectDisease(imageBuffer, mimeType) {
	if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
		throw new Error("detectDisease requires a valid image buffer.");
	}

	console.log("[ImageService] Sending image to local Python AI service...");

	let lastError = null;

	for (const url of [PRIMARY_URL, FALLBACK_URL]) {
		try {
			const response = await axios({
				method: "post",
				url,
				data: imageBuffer,
				headers: { "Content-Type": mimeType },
				timeout: 30000, // Local inference can take a few seconds
			});

			const { label, score } = response.data;

			if (!label) {
				throw new Error("AI service returned an empty label.");
			}

			const confidence = typeof score === "number" ? score : 0;
			const isHighConfidence = confidence >= CONFIDENCE_THRESHOLD;

			console.log(
				`[ImageService] Model result: "${label}" (${(confidence * 100).toFixed(1)}% confidence) — ` +
				`${isHighConfidence ? "HIGH confidence ✓" : "LOW confidence ⚠ — vision LLM will determine diagnosis"}`
			);

			const parsed = parsePlantVillageLabel(label);

			return {
				...parsed,
				confidence,
				isHighConfidence,
				rawLabel: label,
			};

		} catch (error) {
			lastError = error;
			const status = error.response?.status;
			const msg    = error.response?.data?.detail || error.message;
			console.warn(`[ImageService] Call to ${url} failed (${status ?? "N/A"}): ${msg}`);
		}
	}

	// Both URLs failed — throw so the controller returns a proper error to the user.
	throw new Error(
		`Plant disease model is unavailable. Make sure the Python AI service is running: ` +
		`cd ai-service && uvicorn main:app --host 127.0.0.1 --port 8000. ` +
		`Detail: ${lastError?.message}`
	);
}

/**
 * Parses the raw model label into a structured { crop, status, disease } object.
 *
 * This model returns labels in one of two formats:
 *   Format A (PlantVillage standard): "Tomato___Early_blight"
 *   Format B (human-readable):        "Tomato with Early Blight"
 */
function parsePlantVillageLabel(label) {
	let crop    = "Unknown";
	let status  = "Diseased";
	let disease = "None";

	if (label.includes("___")) {
		// Format A: "Tomato___Early_blight"
		const parts       = label.split("___");
		crop              = parts[0].replace(/_/g, " ").trim();
		const diseasePart = parts[1].replace(/_/g, " ").trim();

		if (diseasePart.toLowerCase() === "healthy") {
			status  = "Healthy";
			disease = "None";
		} else {
			status  = "Diseased";
			disease = diseasePart;
		}

	} else if (label.toLowerCase().includes(" with ")) {
		// Format B: "Tomato with Early Blight"
		const idx = label.toLowerCase().indexOf(" with ");
		crop      = label.substring(0, idx).trim();
		disease   = label.substring(idx + 6).trim();
		status    = "Diseased";

	} else if (label.toLowerCase().includes("healthy")) {
		// e.g. "Corn healthy" or just "healthy"
		const parts = label.split(/healthy/i);
		crop    = parts[0].replace(/_/g, " ").trim() || "Unknown";
		status  = "Healthy";
		disease = "None";

	} else {
		// Unknown format — store full label as disease name
		disease = label.replace(/_/g, " ").trim();
	}

	return { crop, status, disease };
}

module.exports = { detectDisease };
