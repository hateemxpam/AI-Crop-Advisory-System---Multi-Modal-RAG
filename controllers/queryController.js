const { handleQuery: runRagPipeline } = require("../services/ragService");
const { badRequest, internalError, ok } = require("../utils/responseHelper");
const { isNonEmptyString, isValidLanguage } = require("../utils/validators");

async function handleQuery(req, res) {
	try {
		const { query, language = "en", location = null } = req.body || {};

		if (!isNonEmptyString(query)) {
			return badRequest(res, "Field 'query' is required and must be a non-empty string.");
		}

		if (!isValidLanguage(language)) {
			return badRequest(res, "Field 'language' must be one of: en, ur, pa.");
		}

		// location is optional — pass it through to the RAG pipeline for weather context.
		const finalAnswer = await runRagPipeline(query.trim(), language, location);
		return ok(res, { response: finalAnswer });
	} catch (error) {
		return internalError(res, "Failed to process advisory query.", error.message);
	}
}

module.exports = {
	handleQuery,
};
