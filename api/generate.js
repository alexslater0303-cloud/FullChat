const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { supabase } = require('../lib/supabase');
const { PERSONAS } = require('../lib/personas');

// Initialize Clients
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { prompt, persona, inviteCode } = req.body;

  try {
    // ── STAGE 0: AUTH ──────────────────────────────────────────────────────
    const { data: tester } = await supabase.from('testers').select('*').eq('invite_code', inviteCode).single();
    if (!tester) return res.status(401).json({ error: 'Invalid Code' });

    // ── STAGE 1: GEMINI RESEARCH (The "Eyes") ──────────────────────────────
    // Gemini 2.0/3.0 is used here for its superior web-search grounding
    const researchModel = genAI.getGenerativeModel({ model: "gemini-2.0-pro-exp" });
    const researchPrompt = `Research the topic: "${prompt}". 
    Find 3 specific cars available in the UK. For each, find:
    1. Real used price range (£).
    2. Power (hp) and 0-60mph time.
    3. One specific YouTube Review Video URL.
    Return as a concise list of facts.`;
    
    const researchData = await researchModel.generateContent(researchPrompt);
    const facts = researchData.response.text();

    // ── STAGE 2: CLAUDE WRITING (The "Voice") ──────────────────────────────
    // Using the stable April 2026 Claude 3.7 model
    const p = PERSONAS[persona] || PERSONAS.default;
    const writerRes = await anthropic.messages.create({
      model: "claude-3-7-sonnet", 
      max_tokens: 3000,
      system: `You are ${p.name}. Style: ${p.style}. Use this research to write a car buying guide: ${facts}`,
      messages: [{ 
        role: "user", 
        content: `Create a JSON article. Format: { "headline": "", "intro": "", "cars": [{ "make": "", "model": "", "price": "", "specs": "", "youtubeUrl": "", "copy": "" }] }` 
      }]
    });

    let article = JSON.parse(writerRes.content[0].text.match(/\{[\s\S]*\}/)[0]);

    // ── STAGE 3: MEDIA POPULATION (The "Images") ───────────────────────────
    article.cars = article.cars.map(car => ({
      ...car,
      // 2026-safe dynamic image redirector
      imageUrl: `https://loremflickr.com/800/600/${encodeURIComponent(car.make + ' ' + car.model + ' car')}/all`
    }));

    // ── STAGE 4: DEDUCT & RESPOND ──────────────────────────────────────────
    await supabase.from('testers').update({ tokens_remaining: tester.tokens_remaining - 40 }).eq('id', tester.id);

    return res.status(200).json({ article });

  } catch (err) {
    console.error('Pipeline Error:', err);
    return res.status(500).json({ error: "Pipeline failed", detail: err.message });
  }
};
