// api/write.js
const Anthropic = require('@anthropic-ai/sdk');
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

module.exports = async (req, res) => {
  const { facts, persona, prompt } = req.body;
  try {
    const msg = await anthropic.messages.create({
      model: "claude-3-5-sonnet-latest",
      max_tokens: 2000,
      system: `You are a car expert. Use these facts: ${facts}`,
      messages: [{ role: "user", content: `Write a car guide for ${prompt} in JSON format.` }]
    });

    const article = JSON.parse(msg.content[0].text.match(/\{[\s\S]*\}/)[0]);
    return res.status(200).json(article);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};