const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { supabase } = require('../lib/supabase');
const { PERSONAS } = require('../lib/personas');

// Initialize AI Clients
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// VERCEL 2026 FIX: Increase timeout to 60 seconds for the Pipeline
export const config = {
  maxDuration: 60, 
};

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, persona, inviteCode } = req.body;

  try {
    // 1. AUTH
    const { data: tester } = await supabase.from('testers').select('*').eq('invite_code', inviteCode).single();
    if (!tester) return res.status(401).json({ error: 'Invalid Code' });

    // 2. STAGE 1: GEMINI RESEARCH (April 2026 Stable Model)
    const researchModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const researchRes = await researchModel.generateContent(`Research 3 cars in the UK for: "${prompt}". Get prices, HP, and a YouTube ID.`);
    const facts = researchRes.response.text();

    // 3. STAGE 2: CLAUDE WRITING (April 2026 Stable Model)
    const p = PERSONAS[persona] || PERSONAS.default;
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6", // This is the production standard for April 2026
      max_tokens: 3000,
      system: `You are ${p.name}. Style: ${p.style}. Research: ${facts}`,
      messages: [{ role: "user", content: `Create JSON article for: ${prompt}` }]
    });

    // 4. CLEAN JSON & IMAGE INJECTION
    const jsonStr = msg.content[0].text.match(/\{[\s\S]*\}/)[0];
    let article = JSON.parse(jsonStr);
    
    article.cars = article.cars.map(car => ({
      ...car,
      imageUrl: `https://loremflickr.com/800/600/${encodeURIComponent(car.make + ' ' + car.model)}/all`
    }));

    return res.status(200).json(article);

  } catch (err) {
    console.error("Pipeline Error:", err.message);
    return res.status(500).json({ error: "Pipeline failed", detail: err.message });
  }
};