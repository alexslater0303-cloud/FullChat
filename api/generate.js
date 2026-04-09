const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('../lib/supabase');
const { PERSONAS } = require('../lib/personas');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const GENERATION_COST = 40;
const FOLLOWUP_COST   = 10;

// 2026 UPDATE: Switched to stable Sonnet 4.6 (Replaces deprecated 3.7 and Sonnet 4 preview)
const CURRENT_MODEL = 'claude-3-5-sonnet-20241022'; // Use 'claude-3-5-sonnet-latest' for auto-updating

function makeSchema(depth) {
  const numCars  = depth === 0 ? 2 : depth === 1 ? 3 : 4;
  const copyLen  = depth === 0 ? '2 sentences' : depth === 1 ? '3 sentences' : '4-5 sentences with technical depth';
  const introLen = depth === 0 ? '1-2 punchy sentences' : depth === 1 ? '2-3 sentences' : '3-4 sentences with real depth';
  const verdict  = depth === 0 ? '2-3 blunt sentences' : depth === 1 ? 'One paragraph' : 'Two paragraphs with nuanced reasoning';
  return { numCars, schema: `{
  "headline": "SHORT PUNCHY UPPERCASE HEADLINE",
  "deck": "One sentence setting the tone",
  "intro": "${introLen}",
  "cars": [
    {
      "make": "Make", "model": "Model", "badge": "Top Pick",
      "stat1_val": "£18,500", "stat1_label": "From (used)",
      "stat2_val": "316hp",   "stat2_label": "Power",
      "stat3_val": "5.4s",    "stat3_label": "0-60",
      "copy": "${copyLen}",
      "imageUrl": "placeholder" 
    }
  ],
  "verdict_title": "THE VERDICT",
  "verdict_copy": "${verdict}"
}`};
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, persona, inviteCode, isFollowUp, articleContext } = req.body;

  try {
    // 1. AUTH & QUOTA CHECK
    const { data: tester, error: tErr } = await supabase.from('testers').select('*').eq('invite_code', inviteCode).single();
    if (tErr || !tester) return res.status(401).json({ error: 'Invalid invite code' });
    
    const cost = isFollowUp ? FOLLOWUP_COST : GENERATION_COST;
    if (tester.tokens_remaining < cost) return res.status(403).json({ error: 'Out of tokens' });

    const p = PERSONAS[persona] || PERSONAS.default;
    const { numCars, schema } = makeSchema(tester.depth || 0);

    // 2. GENERATE CONTENT
    const systemPrompt = `You are ${p.name}. Style: ${p.style}. Return ONLY valid JSON matching this schema: ${schema}`;
    const userMessage = isFollowUp 
      ? `Original Article: ${JSON.stringify(articleContext)}\n\nUser Question: ${prompt}\n\nUpdate the article based on the prompt. Keep the JSON structure.`
      : `Topic/URL: ${prompt}\n\nFind exactly ${numCars} cars. High-quality UK market info only.`;

    const response = await client.messages.create({
      model: CURRENT_MODEL,
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    });

    const rawText = response.content[0].text;
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Claude didn't return valid JSON");
    
    let article = JSON.parse(jsonMatch[0]);

    // 3. 2026 IMAGE SYSTEM (Replaces dead Unsplash Source)
    article.cars = article.cars.map(car => ({
      ...car,
      imageUrl: `https://loremflickr.com/800/600/${encodeURIComponent(car.make + ' ' + car.model + ' car')}/all`
    }));

    // 4. DEDUCT TOKENS
    await supabase.from('testers').update({
      tokens_remaining: tester.tokens_remaining - cost,
      tokens_used: (tester.tokens_used || 0) + cost
    }).eq('id', tester.id);

    return res.status(200).json(article);

  } catch (err) {
    console.error('Generation error:', err);
    // Return the specific error to help with debugging
    return res.status(500).json({ error: err.message });
  }
};
