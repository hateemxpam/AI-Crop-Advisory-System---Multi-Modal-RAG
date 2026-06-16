const Groq = require("groq-sdk");
require("dotenv").config();
const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
async function list() {
  const models = await client.models.list();
  console.log(models.data.map(m => m.id).filter(id => id.includes("vision")));
}
list();

