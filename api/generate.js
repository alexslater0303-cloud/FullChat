const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { supabase } = require('../lib/supabase');
const { PERSONAS } = require('../lib/personas');

// Initialize AI Clients
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const GENERATION_COST = 40;
const FOLLOWUP_COST   = 10;

// Helper to define the JSON structure for Claude
function makeSchema(depth) {
  const numCars  = depth === 0 ? 2 : depth === 1 ? 3 : 4;
  const copyLen  = depth === 0 ? '2 sentences' : depth === 1 ? '3 sentences' : '4-5 sentences with technical depth';
  const introLen = depth === 0 ? '1-2 punchy sentences' : depth === 1 ? '2-3 sentences' : '3-4 sentences with real depth';
  const verdict  = depth === 0 ? '2-3 blunt sentences' : depth === 1 ? 'One paragraph' : 'Two paragraphs with nuanced reasoning';
  
  return { 
    numCars, 
    schema: `{
      "headline": "SHORT PUNCHY UPPERCASE HEADLINE",
      "deck": "One sentence setting the tone",
      "intro": "${introLen}",
      "cars": [
        {
          "make": "Make", 
          "model": "Model", 
          "badge": "Top Pick",
          "stat1_val": "£18,500", "stat1_label": "From (used)",
          "stat2_val": "316hp",   "stat2_label": "Power",
          "stat3_val": "5.4s",    "stat3_label": "0-62mph",
          "copy": "${copyLen}",
          "youtubeId": "The YouTube video ID provided in research",
          "quote": "Real attributed quote from known automotive journalist about this specific car",
          "quoteAttribution": "Journalist Name, Publication"
        }
      ],
      "verdict": "${verdict}",
      "buyingGuide": [{"title":"Watch point","detail":"One sentence practical advice."}]
    }` 
  };
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, persona, depth = 1, inviteCode, mode = 'article', history = [] } = req.body || {};

  if (!prompt || !persona || !inviteCode) {
    return res.status(400).json({ error: 'prompt, persona and inviteCode required' });
  }

  const normCode = inviteCode.trim().toUpperCase();
  const cost     = mode === 'followup' ? FOLLOWUP_COST : GENERATION_COST;

  try {
    // ── 1. AUTH & QUOTA CHECK ──────────────────────────────────────────────
    const { data: tester, error: tErr } = await supabase
      .from('testers').select('*').eq('invite_code', normCode).eq('active', true).single();

    if (tErr || !tester) return res.status(403).json({ error: 'Invalid or inactive invite code' });
    if (tester.tokens_remaining < cost) return res.status(402).json({ error: 'Insufficient tokens' });

    const p = PERSONAS[persona] || PERSONAS.default;

    // ── 2. FOLLOW-UP MODE ──────────────────────────────────────────────────
    if (mode === 'followup') {
      const r = await anthropic.messages.create({
        model: 'claude-3-7-sonnet',
        max_tokens: 400,
        system: p.systemPrompt,
        messages: [...history.map(m => ({ role: m.role, content: m.content })), { role: 'user', content: prompt }]
      });
      const answer = r.content?.find(b => b.type === 'text')?.text || 'Try again.';
      await supabase.from('testers').update({ tokens_remaining: tester.tokens_remaining - cost }).eq('id', tester.id);
      return res.status(200).json({ answer });
    }

    // ── 3. PIPELINE STAGE 1: GEMINI RESEARCH ──────────────────────────────
    const researchModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const { numCars, schema } = makeSchema(depth);

    const researchPrompt = `Research the topic: "${prompt}". 
    Find exactly ${numCars} cars currently for sale in the UK. For each:
    - Current used price range (£)
    - HP and 0-62mph time
    - Search for a specific YouTube review and provide the VIDEO ID (e.g. dQw4w9WgXcQ)
    Return the data as a clean list of facts.`;
    
    const researchRes = await researchModel.generateContent(researchPrompt);
    const researchFacts = researchRes.response.text();

    // ── 4. PIPELINE STAGE 2: CLAUDE WRITING ───────────────────────────────
    const writerRes = await anthropic.messages.create({
      model: 'claude-3-7-sonnet',
      max_tokens: 4000,
      system: `${p.systemPrompt}\n\nUse this research to ground your article: ${researchFacts}`,
      messages: [{
        role: 'user',
        content: `Topic: "${prompt}". Create a Full Chat guide. Return ONLY valid JSON: ${schema}`
      }]
    });

    const raw = (writerRes.content?.find(b => b.type === 'text')?.text || '').match(/\{[\s\S]*\}/)[0];
    let article = JSON.parse(raw);

    // ── 5. PIPELINE STAGE 3: MEDIA INJECTION ──────────────────────────────
    article.cars = article.cars.map(car => ({
      ...car,
      // Dynamic image search based on car name (2026-safe replacement for Unsplash Source)
      imageUrl: `https://loremflickr.com/800/600/${encodeURIComponent(car.make + ' ' + car.model + ' car')}/all`
    }));

    // ── 6. DEDUCT & LOG ────────────────────────────────────────────────────
    await supabase.from('testers').update({
      tokens_remaining: tester.tokens_remaining - cost,
      tokens_used: (tester.tokens_used || 0) + cost
    }).eq('id', tester.id);

    return res.status(200).json({ article, tokens_remaining: tester.tokens_remaining - cost });

  } catch (err) {
    console.error('Pipeline Error:', err);
    return res.status(500).json({ error: 'Generation failed', detail: err.message });
  }
};
