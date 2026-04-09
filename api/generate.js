const Anthropic = require('@anthropic-ai/sdk');
// 2026 UPDATE: Use the NEW @google/genai library
const { GoogleGenAI } = require('@google/genai'); 
const { supabase } = require('../lib/supabase');
const { PERSONAS } = require('../lib/personas');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
// New initialization (will auto-read GOOGLE_API_KEY or use your provided key)
const googleAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { prompt, persona, inviteCode } = req.body;

  try {
    // 1. AUTH
    const { data: tester } = await supabase.from('testers').select('*').eq('invite_code', inviteCode).single();
    if (!tester) return res.status(401).json({ error: 'Invalid Code' });

    // 2. STAGE 1: GEMINI RESEARCH (Using 2026 Interactions API)
    // Using gemini-3.1-flash, the current cost-efficient standard
    const research = await googleAI.interactions.create({
      model: 'gemini-3.1-flash',
      input: `Find 3 cars in the UK for: "${prompt}". Research price, HP, and a YouTube ID.`,
      tools: [{ type: 'google_search' }] // Built-in search grounding
    });
    const facts = research.text; 

    // 3. STAGE 2: CLAUDE WRITING (Using 2026 Stable Model)
    const p = PERSONAS[persona] || PERSONAS.default;
    const writerRes = await anthropic.messages.create({
      model: "claude-4-sonnet-20260307", // The new April 2026 production standard
      max_tokens: 3000,
      system: `You are ${p.name}. Style: ${p.style}. Research: ${facts}`,
      messages: [{ role: "user", content: `Create JSON article for: ${prompt}` }]
    });

    const article = JSON.parse(writerRes.content[0].text.match(/\{[\s\S]*\}/)[0]);

    // 4. STAGE 3: MEDIA (2026 safe dynamic placeholder)
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