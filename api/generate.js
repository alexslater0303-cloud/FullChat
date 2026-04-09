const Anthropic = require('@anthropic-ai/sdk');
// 2026 UPDATE: Using the NEW Google Gen AI SDK
const { GoogleGenAI } = require('@google/genai'); 
const { supabase } = require('../lib/supabase');
const { PERSONAS } = require('../lib/personas');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const googleAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send();
  const { prompt, persona, inviteCode } = req.body;

  try {
    // 1. AUTH
    const { data: tester } = await supabase.from('testers').select('*').eq('invite_code', inviteCode).single();
    if (!tester) return res.status(401).json({ error: 'Auth Failed' });

    // 2. STAGE 1: GEMINI RESEARCH (Fast 2026 SDK)
    // We use 'flash' to ensure we stay under Vercel's 10s timeout
    const research = await googleAI.models.generateContent({
      model: 'gemini-2.0-flash', 
      contents: [{ role: 'user', parts: [{ text: `Research 3 cars in UK for: "${prompt}". Need prices and YouTube IDs.` }] }]
    });
    const facts = research.text; 

    // 3. STAGE 2: CLAUDE WRITING (Claude 4.6 Standard)
    const p = PERSONAS[persona] || PERSONAS.default;
    const msg = await anthropic.messages.create({
      model: "claude-4-6-sonnet", // The new stable standard for April 2026
      max_tokens: 2000,
      system: `You are ${p.name}. Style: ${p.style}. Facts: ${facts}`,
      messages: [{ role: "user", content: `Generate JSON for: ${prompt}` }]
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