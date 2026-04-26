const axios = require("axios");

const configuredBaseUrl = process.env.FAISS_SERVICE_URL || "http://127.0.0.1:8000";

function buildSearchEndpoints() {
	const normalizedConfigured = configuredBaseUrl.replace(/\/+$/, "");
	const endpoints = [`${normalizedConfigured}/search`];

	// Windows can resolve localhost differently; keep a fallback for reliability.
	if (normalizedConfigured.includes("127.0.0.1")) {
		endpoints.push(`${normalizedConfigured.replace("127.0.0.1", "localhost")}/search`);
	}

	return endpoints;
}

const SEARCH_ENDPOINTS = buildSearchEndpoints();

/**
 * Retrieve top relevant knowledge chunks from the Python FAISS microservice.
 *
 * @param {string} query
 * @returns {Promise<string[]>}
 */
async function searchKnowledge(query) {
	if (typeof query !== "string" || !query.trim()) {
		console.error("[FaissService] searchKnowledge called with invalid query.");
		return [];
	}

	for (const endpoint of SEARCH_ENDPOINTS) {
		try {
			const response = await axios.post(
				endpoint,
				{ query: query.trim() },
				{
					timeout: 8000,
					headers: {
						"Content-Type": "application/json",
					},
				}
			);

			const results = response?.data?.results;

			if (!Array.isArray(results)) {
				console.error("[FaissService] Unexpected response format from FAISS service.", response?.data);
				return [];
			}

			return results;
		} catch (error) {
			const status = error?.response?.status;
			const details = error?.response?.data || error?.message;
			const code = error?.code ? ` (code: ${error.code})` : "";

			console.error(
				`[FaissService] Failed to fetch knowledge from ${endpoint}${status ? ` (status: ${status})` : ""}${code}.`,
				details
			);
		}
	}

	return [];
}

module.exports = {
	searchKnowledge,
};
