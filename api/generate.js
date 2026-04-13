const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('../lib/supabase');
const { PERSONAS } = require('../lib/personas');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const COSTS = { article: 40, followup: 10 };

// ── Schema ────────────────────────────────────────────────────────────────────
function makeSchema(depth, requestedCount = null) {
  // Use requested count (e.g. 1 for deep dive) or default based on depth
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
          contents: [{ parts: [{ text:
            `You are a motoring research analyst. Research this brief: "${prompt}"
Provide:
1. MARKET OVERVIEW — current UK used market conditions and price ranges
2. TOP CANDIDATES — specific cars that fit the brief with current UK prices
3. RELIABILITY — known issues, owner satisfaction
4. OWNERSHIP COSTS — running costs, depreciation
5. CRITICAL RECEPTION — what reviewers have said
Be specific with current UK prices. Be honest about weaknesses.`
          }] }],
          tools: [{ googleSearch: {} }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 1500 }
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
  try { return JSON.parse(c); } catch {}
  const m = c.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

// ── Main handler ──────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, persona, depth=1, inviteCode, mode='article', context='', history=[] } = req.body || {};

  if (!prompt)     return res.status(400).json({ error: 'prompt is required' });
  if (!persona)    return res.status(400).json({ error: 'persona is required' });
  if (!inviteCode) return res.status(400).json({ error: 'inviteCode is required' });
  if (!PERSONAS[persona]) return res.status(400).json({ error: 'Invalid persona' });

  const normCode = inviteCode.trim().toUpperCase();
  const cost     = COSTS[mode] || COSTS.article;
  const p        = PERSONAS[persona];

  // Detect if user wants a single car deep dive
  let requestedCount = null;
  const lowerPrompt = prompt.toLowerCase();
  if (lowerPrompt.includes('deep dive') || lowerPrompt.includes('single car') || lowerPrompt.includes('just one car')) {
    requestedCount = 1;
  }

  // Validate tester
  const { data: tester, error: tErr } = await supabase
    .from('testers')
    .select('id, name, tokens_remaining, tokens_used')
    .eq('invite_code', normCode)
    .eq('active', true)
    .single();

  if (tErr || !tester) return res.status(403).json({ error: 'Invalid or inactive invite code' });
  if (tester.tokens_remaining < cost) return res.status(402).json({ error: 'Out of tokens!', tokens_remaining: tester.tokens_remaining });

  // ── FOLLOW-UP (non-streaming) ─────────────────────────────────────────────
  if (mode === 'followup') {
    try {
      const r = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20240620', max_tokens: 400,
        system: p.systemPrompt + (context ? `\n\n${context}` : ''),
        messages: [...history.map(m=>({role:m.role,content:m.content})), {role:'user',content:prompt}]
      });
      const answer = r.content?.find(b=>b.type==='text')?.text || 'Sorry, try again.';
      
      await supabase.from('testers').update({
        tokens_remaining: tester.tokens_remaining - cost,
        tokens_used: (tester.tokens_used||0) + cost
      }).eq('id', tester.id);

      return res.status(200).json({ answer, tokens_remaining: tester.tokens_remaining - cost });
    } catch(err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── ARTICLE — STREAMING ───────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    send('step', { step: 'research', state: 'active', status: 'Querying Gemini with live Google Search...' });
    const research = await geminiResearch(prompt);
    send('step', { step: 'research', state: 'done', status: research ? 'Live market data gathered ✓' : 'Research complete ✓', usedGemini: !!research });

    send('step', { step: 'write', state: 'active', status: 'Writing your feature...' });

    const { numCars, maxTokens, schema } = makeSchema(Number(depth), requestedCount);
    const researchBlock = research
      ? `\n\nCurrent market research — use these facts:\n\n---\n${research}\n---\n`
      : '';

    let fullText = '';

    const stream = anthropic.messages.stream({
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: maxTokens,
      system: p.systemPrompt,
      messages: [{
        role: 'user',
        content: `Write a Full Chat motoring feature about: "${prompt}"${researchBlock}

Accurate real-world UK used prices and genuine specs. Write in your distinct voice. Include ${numCars} car(s).

Respond with ONLY a valid JSON object:
${schema}`
      }]
    });

    stream.on('text', (chunk) => {
      fullText += chunk;
      send('token', { chunk });
    });

    await stream.finalMessage();
    send('step', { step: 'write', state: 'done', status: 'Article written ✓' });

    send('step', { step: 'fact', state: 'active', status: 'Cross-checking claims...' });

    let article = parseJSON(fullText);
    if (!article) {
      send('error', { message: 'Could not parse article' });
      res.end(); return;
    }

    // Send the final parsed article
    send('article', { article, usedGemini: !!research, tokens_remaining: tester.tokens_remaining - cost });

    // Deduct tokens safely
    const { error: upError } = await supabase.from('testers').update({
      tokens_remaining: tester.tokens_remaining - cost,
      tokens_used: (tester.tokens_used||0) + cost
    }).eq('id', tester.id);
    if (upError) console.error('Credit update failed:', upError.message);

    // Log the generation safely
    const { error: logError } = await supabase.from('generations').insert({
      tester_id: tester.id, 
      prompt, 
      persona,
      tokens_used: cost, 
      article_headline: article.headline||null,
      used_gemini: !!research
    });
    if (logError) console.error('Log failed:', logError.message);

    send('done', {});
    res.end();

  } catch(err) {
    console.error('Stream error:', err.message);
    send('error', { message: err.message || 'Generation failed' });
    res.end();
  }
};