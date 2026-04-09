const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require("@google/generative-ai"); // Use the STABLE 2025 version for now
const { supabase } = require('../lib/supabase');
const { PERSONAS } = require('../lib/personas');

// API Clients
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send();
  const { prompt, persona, inviteCode } = req.body;

  try {
    // 1. AUTH
    const { data: tester } = await supabase.from('testers').select('*').eq('invite_code', inviteCode).single();
    if (!tester) return res.status(401).json({ error: 'Auth Failed' });

    // 2. STAGE 1: GEMINI RESEARCH
    // Using gemini-2.0-flash (The 2026 stable workhorse)
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const research = await model.generateContent(`UK Car Research: "${prompt}". Need 3 cars with Price, HP, and YouTube ID.`);
    const facts = research.response.text();

    // 3. STAGE 2: CLAUDE WRITING
    const p = PERSONAS[persona] || PERSONAS.default;
    const msg = await anthropic.messages.create({
      model: "claude-3-5-sonnet-latest", // Use 'latest' to avoid the 2026 model-ID sunset
      max_tokens: 3000,
      system: `You are ${p.name}. Style: ${p.style}. Facts: ${facts}`,
      messages: [{ role: "user", content: `Write a car guide for ${prompt}. Return ONLY JSON.` }]
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
    console.error("Pipeline Crash:", err.message);
    return res.status(500).json({ error: "Pipeline failed", detail: err.message });
  }
};