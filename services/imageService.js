/**
 * imageService.js
 *
 * PURPOSE:
 * Detects crop disease from an uploaded image using a specialized Computer Vision
 * model hosted on HuggingFace Inference API.
 */

const axios = require("axios");
require("dotenv").config();

const HF_TOKEN = process.env.HF_TOKEN;

// Using a highly reliable plant disease model
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

	console.log("[ImageService] Analyzing image via HuggingFace...");

	try {
		// We use a helper to handle the "model loading" state (503 error)
		const response = await queryHuggingFace(imageBuffer, mimeType);

		const predictions = response.data;
		
		if (!Array.isArray(predictions) || predictions.length === 0) {
			throw new Error("HuggingFace returned an empty prediction list.");
		}

		// The top prediction (index 0) is the most likely one
		const topPrediction = predictions[0].label;
		console.log(`[ImageService] Result: ${topPrediction} (Confidence: ${(predictions[0].score * 100).toFixed(1)}%)`);

		return parsePlantVillageLabel(topPrediction);

	} catch (error) {
		console.error("[ImageService] API Error Details:", error.response?.data || error.message);
		
		if (error.response?.status === 503) {
			throw new Error("The AI model is still waking up. Please try again in 20 seconds.");
		}

		throw new Error("Could not analyze the image. Please ensure the leaf is clearly visible.");
	}
}

/**
 * Helper to call HuggingFace with optional retry logic if the model is loading
 */
async function queryHuggingFace(data, mimeType) {
	return axios({
		method: "post",
		url: HF_MODEL_URL,
		data: data,
		headers: {
			"Authorization": `Bearer ${HF_TOKEN}`,
			"Content-Type": mimeType
		},
		// This header tells HuggingFace to wait for the model to load if it's idle
		params: { wait_for_model: true }
	});
}

/**
 * Parses the standard PlantVillage label format.
 * Format: "CropName___Disease_Name"
 */
function parsePlantVillageLabel(label) {
	let crop = "Unknown";
	let status = "Diseased";
	let disease = "None";

	if (label.includes("___")) {
		const parts = label.split("___");
		crop = parts[0].replace(/_/g, " ").trim();
		const diseaseName = parts[1].replace(/_/g, " ").trim();

		if (diseaseName.toLowerCase() === "healthy") {
			status = "Healthy";
			disease = "None";
		} else {
			status = "Diseased";
			disease = diseaseName;
		}
	} else {
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
