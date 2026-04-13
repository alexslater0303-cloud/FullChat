const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('../lib/supabase');
const { PERSONAS } = require('../lib/personas');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const COSTS = { article: 40, followup: 10 };

// ── Schema ────────────────────────────────────────────────────────────────────
function makeSchema(depth, requestedCount) {
  // Use requested count (1 for deep dive) or default based on depth
  const cars = requestedCount || (depth === 0 ? 2 : depth === 1 ? 3 : 4);
  
  const isDeepDive = cars === 1;
  const copy = isDeepDive 
    ? '8-10 sentences with high technical depth, common faults, and driving dynamics' 
    : (depth === 0 ? '2 sentences' : depth === 1 ? '3 sentences' : '4-5 sentences with technical depth');
  
  const intro   = depth === 0 ? '1-2 punchy sentences' : depth === 1 ? '2-3 sentences' : '3-4 sentences with real depth';
  const verdict = depth === 0 ? '2-3 blunt sentences' : depth === 1 ? 'One paragraph' : 'Two paragraphs with nuanced reasoning';
  
  return {
    numCars: cars,
    maxTokens: depth === 0 ? 1800 : depth === 1 ? 2800 : 3800,
    schema: `{
  "headline": "SHORT PUNCHY UPPERCASE HEADLINE",
  "deck": "One sentence setting the tone",
  "intro": "${intro}",
  "cars": [
    {
      "make": "Make", "model": "Model", "badge": "${isDeepDive ? 'The Focus' : 'Top Pick'}",
      "stat1_val": "£18,500", "stat1_label": "From (used)",
      "stat2_val": "316hp",   "stat2_label": "Power",
      "stat3_val": "5.4s",    "stat3_label": "0-62mph",
      "copy": "${copy}",
      "quote": "Real attributed quote from a known automotive journalist",
      "quoteAttribution": "Journalist Name, Publication"
    }
  ],
  "verdict": "${verdict}",
  "buyingGuide": [{ "title": "Watch point", "detail": "One sentence of practical buying advice." }]
}`
  };
}

// ── Gemini research ───────────────────────────────────────────────────────────
async function geminiResearch(prompt) {
  const KEY = process.env.GEMINI_API_KEY;
  if (!KEY) return null;
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Research this brief: "${prompt}"...` }] }],
          tools: [{ googleSearch: {} }]
        })
      }
    );
    if (!r.ok) return null;
    const d = await r.json();
    return d.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch { return null; }
}

// ── Parse JSON safely ─────────────────────────────────────────────────────────
function parseJSON(raw) {
  const c = raw.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
  try { return JSON.parse(c); } catch {
    const m = c.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
  }
  return null;
}

// ── Main handler ──────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const { prompt, persona, depth = 1, inviteCode, mode = 'article' } = body;

  if (!prompt || !persona || !inviteCode) return res.status(400).json({ error: 'Missing required fields' });
  if (!PERSONAS[persona]) return res.status(400).json({ error: 'Invalid persona' });

  const normCode = inviteCode.trim().toUpperCase();
  const cost     = COSTS[mode] || COSTS.article;

  // Deep dive detection
  let requestedCount = null;
  if (prompt.toLowerCase().match(/deep dive|single car|just one car/)) {
    requestedCount = 1;
  }

  // Validate tester
  const { data: tester, error: tErr } = await supabase
    .from('testers')
    .select('*')
    .eq('invite_code', normCode)
    .eq('active', true)
    .single();

  if (tErr || !tester) return res.status(403).json({ error: 'Invalid invite code' });
  if (tester.tokens_remaining < cost) return res.status(402).json({ error: 'No tokens' });

  // Article Streaming logic
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders();

  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    const research = await geminiResearch(prompt);
    send('step', { step: 'research', state: 'done' });

    const { numCars, maxTokens, schema } = makeSchema(Number(depth), requestedCount);

    const stream = anthropic.messages.stream({
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: maxTokens,
      system: PERSONAS[persona].systemPrompt,
      messages: [{ role: 'user', content: `Write about: ${prompt}. JSON only: ${schema}` }]
    });

    let fullText = '';
    stream.on('text', (chunk) => {
      fullText += chunk;
      send('token', { chunk });
    });

    await stream.finalMessage();
    const article = parseJSON(fullText);

    if (article) {
      send('article', { article, usedGemini: !!research });
      
      // Database Updates
      await supabase.from('testers').update({
        tokens_remaining: tester.tokens_remaining - cost,
        tokens_used: (tester.tokens_used || 0) + cost
      }).eq('id', tester.id);

      await supabase.from('generations').insert({
        tester_id: tester.id,
        prompt,
        persona,
        tokens_used: cost,
        article_headline: article.headline || null
      });
    }

    send('done', {});
    res.end();

  } catch (err) {
    console.error(err);
    res.end();
  }
};