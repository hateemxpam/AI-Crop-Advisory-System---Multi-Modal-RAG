/**
 * imageService.js
 *
 * PURPOSE:
 * Detects crop disease from an uploaded image using a specialized Computer Vision
 * model hosted on HuggingFace Inference API.
 * Returns ONLY the disease name (not full advice), so it can be fed into
 * the existing RAG pipeline for a grounded, knowledge-backed response.
 */

const axios = require("axios");
require("dotenv").config();

const HF_TOKEN = process.env.HF_TOKEN;

// We use a robust pre-trained Plant Disease Classification model
const HF_MODEL_URL = "https://api-inference.huggingface.co/models/linkinstar/plant-disease-classification";

/**
 * Detect the crop disease from an uploaded image using HuggingFace.
 *
 * @param {Buffer} imageBuffer  - Raw image bytes from multer
 * @param {string} mimeType     - MIME type of the uploaded image
 * @returns {Promise<{ crop: string, status: string, disease: string }>}
 */
async function detectDisease(imageBuffer, mimeType) {
	if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
		throw new Error("detectDisease requires a valid image buffer.");
	}

	if (!HF_TOKEN) {
		throw new Error("Missing HF_TOKEN in environment variables.");
	}

	console.log("[ImageService] Sending image to HuggingFace for analysis...");

	try {
		// Send the raw binary buffer directly to the HF Inference API
		const response = await axios.post(HF_MODEL_URL, imageBuffer, {
			headers: {
				Authorization: `Bearer ${HF_TOKEN}`,
				"Content-Type": mimeType,
			},
		});

		// Response format is typically an array of predictions sorted by confidence:
		// [ { "label": "Tomato___Early_blight", "score": 0.98 }, ... ]
		const predictions = response.data;
		
		if (!Array.isArray(predictions) || predictions.length === 0) {
			throw new Error("Invalid response format from HuggingFace.");
		}

		const topPrediction = predictions[0].label;
		console.log(`[ImageService] HF Top Prediction: ${topPrediction} (Score: ${predictions[0].score})`);

		return parsePlantVillageLabel(topPrediction);

	} catch (error) {
		console.error("[ImageService] HuggingFace API Error:", error.response?.data || error.message);
		
		// If HF is warming up the model (503), it returns an estimated time.
		if (error.response?.status === 503) {
			throw new Error("The Computer Vision model is currently warming up. Please try again in 30 seconds.");
		}

		throw new Error("Failed to analyze image using Computer Vision model.");
	}
}

/**
 * Parses the standard PlantVillage label format used by most HF models.
 * Format is usually: "CropName___Disease_Name" or "CropName___healthy"
 *
 * @param {string} label - e.g., "Tomato___Early_blight" or "Apple___healthy"
 * @returns {{ crop: string, status: string, disease: string }}
 */
function parsePlantVillageLabel(label) {
	let crop = "Unknown";
	let status = "Diseased";
	let disease = "Unknown";

	// If the label contains the standard triple-underscore delimiter
	if (label.includes("___")) {
		const parts = label.split("___");
		crop = parts[0].replace(/_/g, " ").trim();
		disease = parts[1].replace(/_/g, " ").trim();

		if (disease.toLowerCase() === "healthy") {
			status = "Healthy";
			disease = "None";
		}
	} else {
		// Fallback if the model uses a different label format
		disease = label.replace(/_/g, " ").trim();
		if (disease.toLowerCase() === "healthy") {
			status = "Healthy";
			disease = "None";
		}
	}

	return { crop, status, disease };
}

module.exports = {
	detectDisease,
};
