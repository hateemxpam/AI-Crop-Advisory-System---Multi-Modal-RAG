/**
 * weatherService.js
 *
 * PURPOSE:
 * Fetches current weather data for a given city using the OpenWeatherMap API.
 * Returns a clean, minimal object that can be injected into the RAG pipeline
 * to make farming recommendations more context-aware (e.g., "avoid spraying
 * pesticides today — it is raining in Lahore").
 *
 * WHERE IT FITS IN THE PIPELINE:
 *
 *   [User submits query + city]
 *          ↓
 *   [getWeather(city)]           ← THIS SERVICE
 *          ↓
 *   [Weather data injected into RAG prompt]
 *          ↓
 *   [LLM generates weather-aware farming advice]
 */

const axios = require("axios");
require("dotenv").config();

const WEATHER_API_KEY = process.env.WEATHER_API_KEY;
const BASE_URL = "https://api.openweathermap.org/data/2.5/weather";

/**
 * Fetch current weather for a given city.
 *
 * @param {string} city  - City name (e.g., "Lahore", "Multan", "Islamabad")
 * @returns {Promise<{ temperature: number, condition: string, humidity: number } | null>}
 *          Returns null if the API call fails or city is not found.
 *
 * @example
 *   const weather = await getWeather("Lahore");
 *   // => { temperature: 32, condition: "Clear", humidity: 45 }
 *
 *   const weather = await getWeather("InvalidCity");
 *   // => null
 */
async function getWeather(city) {
	if (!city || typeof city !== "string" || !city.trim()) {
		console.warn("[WeatherService] getWeather called with invalid city.");
		return null;
	}

	if (!WEATHER_API_KEY) {
		console.error("[WeatherService] Missing WEATHER_API_KEY in environment.");
		return null;
	}

	try {
		const response = await axios.get(BASE_URL, {
			params: {
				q: city.trim(),
				appid: WEATHER_API_KEY,
				units: "metric",   // Temperature in Celsius (not Fahrenheit)
				lang: "en",
			},
			timeout: 6000,         // 6 second timeout — don't block the pipeline too long
		});

		const data = response.data;

		// Extract only what is needed for farming advice.
		// Full API response has many fields we don't need.
		const weather = {
			temperature: Math.round(data.main.temp),           // °C, rounded to nearest integer
			condition: data.weather[0]?.main || "Unknown",     // e.g. "Rain", "Clear", "Clouds"
			humidity: data.main.humidity,                      // Relative humidity in %
		};

		console.log(`[WeatherService] ${city} → Temp: ${weather.temperature}°C, Condition: ${weather.condition}, Humidity: ${weather.humidity}%`);

		return weather;
	} catch (error) {
		const status = error?.response?.status;
		const message = error?.response?.data?.message || error.message;

		if (status === 404) {
			console.warn(`[WeatherService] City not found: "${city}".`);
		} else if (status === 401) {
			console.error("[WeatherService] Invalid WEATHER_API_KEY.");
		} else {
			console.error(`[WeatherService] Failed to fetch weather for "${city}":`, message);
		}

		// Always return null on failure so the RAG pipeline can
		// continue without weather data rather than crashing.
		return null;
	}
}

module.exports = {
	getWeather,
};
