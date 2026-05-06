const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

async function list() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const models = ["gemini-pro"];
  
  for (const m of models) {
    try {
      const model = genAI.getGenerativeModel({ model: m });
      const result = await model.generateContent("Hello");
      console.log(`[SUCCESS] ${m}:`, await result.response.text());
      return;
    } catch(err) {
      console.log(`[FAIL] ${m}:`, err.message);
    }
  }
}
list();
