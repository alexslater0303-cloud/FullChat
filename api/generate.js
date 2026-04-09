const Anthropic = require('@anthropic-ai/sdk');
// 2026 UPDATE: Import the NEW Google GenAI SDK client
const { GoogleGenAI } = require('@google/genai'); 
const { supabase } = require('../lib/supabase');
const { PERSONAS } = require('../lib/personas');

// Initialization
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
// 2026 UPDATE: New client-based initialization
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { prompt, persona, inviteCode } = req.body;

  try {
    // ── STAGE 0: AUTH ──────────────────────────────────────────────────────
    const { data: tester } = await supabase.from('testers').select('*').eq('invite_code', inviteCode).single();
    if (!tester) return res.status(401).json({ error: 'Invalid Code' });

    // ── STAGE 1: GEMINI RESEARCH ──────────────────────────────────────────
    // 2026 UPDATE: Using the new .models.generateContent structure
    const research = await ai.models.generateContent({
      model: 'gemini-2.0-flash', 
      contents: [{ role: 'user', parts: [{ text: `Research 3 UK cars for: "${prompt}". Need prices and YouTube IDs.` }] }]
    });
    const facts = research.text; 

    // ── STAGE 2: CLAUDE WRITING ───────────────────────────────────────────
    const p = PERSONAS[persona] || PERSONAS.default;
    const writerRes = await anthropic.messages.create({
      model: "claude-3-7-sonnet", // Updated to the stable 2026 reasoning model
      max_tokens: 3000,
      system: `You are ${p.name}. Style: ${p.style}. Use this research: ${facts}`,
      messages: [{ role: "user", content: `Generate JSON for: ${prompt}` }]
    });

    const article = JSON.parse(writerRes.content[0].text.match(/\{[\s\S]*\}/)[0]);

    // ── STAGE 3: MEDIA ────────────────────────────────────────────────────
    article.cars = article.cars.map(car => ({
      ...car,
      imageUrl: `https://loremflickr.com/800/600/${encodeURIComponent(car.make + ' ' + car.model)}/all`
    }));

    return res.status(200).json(article);

  } catch (err) {
    console.error('Pipeline Error:', err);
    return res.status(500).json({ error: "Pipeline failed", detail: err.message });
  }
};