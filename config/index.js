require("dotenv").config();

const config = {
	port: Number(process.env.PORT) || 3000,
	llm: {
		provider: (process.env.LLM_PROVIDER || "gemini").toLowerCase(),
		model: process.env.LLM_MODEL || "gemini-2.5-flash",
		apiKey: process.env.GEMINI_API_KEY || "",
		temperature: Number(process.env.LLM_TEMPERATURE ?? 0.2),
		maxOutputTokens: Number(process.env.LLM_MAX_OUTPUT_TOKENS ?? 512),
	},
};

module.exports = config;
