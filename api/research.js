// api/research.js
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

module.exports = async (req, res) => {
  const { prompt } = req.body;
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(`Research 3 cars in the UK for: "${prompt}". Return only a bulleted list of Price, HP, and YouTube IDs.`);
    const facts = result.response.text();
    
    // Send just the raw facts back to the browser
    return res.status(200).json({ facts });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};