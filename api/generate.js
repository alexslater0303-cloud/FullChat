const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { supabase } = require('../lib/supabase');
const { PERSONAS } = require('../lib/personas');

// Initialize AI Clients
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { prompt, persona, inviteCode } = req.body;

  try {
    // ── STAGE 0: AUTH ──────────────────────────────────────────────────────
    const { data: tester } = await supabase.from('testers').select('*').eq('invite_code', inviteCode).single();
    if (!tester) return res.status(401).json({ error: 'Invalid Code' });

    // ── STAGE 1: GEMINI RESEARCH (The "Eyes") ──────────────────────────────
    // Gemini handles the live web search for real UK car data and YouTube links
    const researchModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const researchPrompt = `Research the topic: "${prompt}". 
    Find exactly 3 real cars for sale in the UK. For each car, provide:
    - Current used price (in GBP £)
    - Key stats (HP and 0-60mph)
    - The ID of a popular YouTube review (the string after v=)
    Return the data as a clean list of facts.`;
    
    const researchRes = await researchModel.generateContent(researchPrompt);
    const researchData = researchRes.response.text();

    // ── STAGE 2: CLAUDE WRITING (The "Voice") ──────────────────────────────
    // Claude uses the research data to write in your chosen Persona's style
    const p = PERSONAS[persona] || PERSONAS.default;
    const writerRes = await anthropic.messages.create({
      model: "claude-3-7-sonnet", // Updated for April 2026 stability
      max_tokens: 3000,
      system: `You are ${p.name}. Style: ${p.style}. 
      Use this raw research: ${researchData}. 
      Return ONLY valid JSON: { "headline": "", "intro": "", "cars": [{ "make": "", "model": "", "price": "", "specs": "", "youtubeId": "", "copy": "" }] }`,
      messages: [{ role: "user", content: `Write a guide about: ${prompt}` }]
    });

    const article = JSON.parse(writerRes.content[0].text.match(/\{[\s\S]*\}/)[0]);

    // ── STAGE 3: MEDIA (The "Visuals") ─────────────────────────────────────
    // Replace broken Unsplash logic with a 2026-safe image service
    article.cars = article.cars.map(car => ({
      ...car,
      imageUrl: `https://loremflickr.com/800/600/${encodeURIComponent(car.make + ' ' + car.model + ' car')}/all`
    }));

    // ── STAGE 4: DEDUCT & RESPOND ──────────────────────────────────────────
    await supabase.from('testers').update({ tokens_remaining: tester.tokens_remaining - 40 }).eq('id', tester.id);

    return res.status(200).json(article);

  } catch (err) {
    console.error('Pipeline Error:', err);
    return res.status(500).json({ error: "Pipeline failed", detail: err.message });
  }
};
