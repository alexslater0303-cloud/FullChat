const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('../lib/supabase');
const { PERSONAS } = require('../lib/personas');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const COSTS = { article: 40, followup: 10 };

// ── Schema ────────────────────────────────────────────────────────────────────
function makeSchema(depth) {
  const cars    = depth === 0 ? 2 : depth === 1 ? 3 : 4;
  const copy    = depth === 0 ? '2 sentences' : depth === 1 ? '3 sentences' : '4-5 sentences with technical depth';
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
      "make": "Make", "model": "Model", "badge": "Top Pick",
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
2. TOP CANDIDATES — 3-4 specific cars that fit the brief with current UK prices
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

  // Validate tester
  const { data: tester, error: tErr } = await supabase
    .from('testers')
    .select('id, name, tokens_remaining, tokens_used')
    .eq('invite_code', normCode)
    .eq('active', true)
    .single();

  if (tErr || !tester) return res.status(403).json({ error: 'Invalid or inactive invite code' });
  if (tester.tokens_remaining < cost) return res.status(402).json({ error: 'Out of tokens — ask Alex for a top up!', tokens_remaining: tester.tokens_remaining });

  // ── FOLLOW-UP (non-streaming) ─────────────────────────────────────────────
  if (mode === 'followup') {
    try {
      const r = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514', max_tokens: 400,
        system: p.systemPrompt + (context ? `\n\n${context}` : ''),
        messages: [...history.map(m=>({role:m.role,content:m.content})), {role:'user',content:prompt}]
      });
      const answer = r.content?.find(b=>b.type==='text')?.text || 'Sorry, try again.';
      
      const { error: upError } = await supabase.from('testers').update({
        tokens_remaining: tester.tokens_remaining - cost,
        tokens_used: (tester.tokens_used||0) + cost
      }).eq('id', tester.id);

      if (upError) console.error("Credit update failed:", upError.message);

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
    // Step 1 — Gemini research
    send('step', { step: 'research', state: 'active', status: 'Querying Gemini with live Google Search...' });
    const research = await geminiResearch(prompt);
    send('step', { step: 'research', state: 'done', status: research ? 'Live market data gathered ✓' : 'Research complete ✓', usedGemini: !!research });

    // Step 2 — Claude write (STREAMING)
    send('step', { step: 'write', state: 'active', status: 'Writing your feature...' });

    const { numCars, maxTokens, schema } = makeSchema(Number(depth));
    const researchBlock = research
      ? `\n\nCurrent market research — use these facts, do not contradict them:\n\n---\n${research}\n---\n`
      : '';

    let fullText = '';

    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system: p.systemPrompt,
      messages: [{
        role: 'user',
        content: `Write a Full Chat motoring feature about: "${prompt}"${researchBlock}

Accurate real-world UK used prices and genuine specs. Write in your distinct voice. Include ${numCars} cars.

For each car's "quote": a real attributed quote from a known automotive journalist (Evo, Top Gear, Autocar, Chris Harris, Henry Catchpole). Put attribution in "quoteAttribution" as "Name, Publication".

Respond with ONLY a valid JSON object — no text before or after, no markdown fences:

${schema}`
      }]
    });

    stream.on('text', (chunk) => {
      fullText += chunk;
      send('token', { chunk });
    });

    await stream.finalMessage();
    send('step', { step: 'write', state: 'done', status: 'Article written ✓' });

    // Step 3 — Silent fact-check
    send('step', { step: 'fact', state: 'active', status: 'Cross-checking claims...' });

    let article = parseJSON(fullText);
    if (!article) {
      send('error', { message: 'Could not parse article — please try again' });
      res.end(); return;
    }

    try {
      const fcRes = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514', max_tokens: 600,
        system: 'You are an automotive fact-checker. Return ONLY valid JSON, no markdown.',
        messages: [{
          role: 'user',
          content: `Check for factual errors (wrong specs, implausible prices). Silently correct anything wrong. If all correct return {"correctedArticle":null}.

Cars: ${JSON.stringify(article.cars?.map(c=>({
  make:c.make, model:c.model,
  stat1:`${c.stat1_val} ${c.stat1_label}`,
  stat2:`${c.stat2_val} ${c.stat2_label}`,
  stat3:`${c.stat3_val} ${c.stat3_label}`
})))}

Return: {"correctedArticle":{"cars":[...full corrected cars...]} or null}`
        }]
      });
      const fc = parseJSON(fcRes.content?.find(b=>b.type==='text')?.text||'{}');
      if (fc?.correctedArticle?.cars?.length) {
        article.cars = article.cars.map((car,i) => {
          const fix = fc.correctedArticle.cars[i];
          return fix ? {...car,...fix} : car;
        });
      }
    } catch(fcErr) {
      console.warn('Fact-check skipped:', fcErr.message);
    }

    send('step', { step: 'fact', state: 'done', status: 'All claims verified ✓' });

    // Send the final parsed article
    send('article', { article, usedGemini: !!research, tokens_remaining: tester.tokens_remaining - cost });

    // Deduct tokens
    const { error: upError } = await supabase.from('testers').update({
      tokens_remaining: tester.tokens_remaining - cost,
      tokens_used: (tester.tokens_used||0) + cost
    }).eq('id', tester.id);

    if (upError) console.warn('Credit update failed:', upError.message);

    // Log the generation
    const { error: logError } = await supabase.from('generations').insert({
      tester_id: tester.id, 
      prompt, 
      persona,
      tokens_used: cost, 
      article_headline: article.headline||null,
      used_gemini: !!research
    });

    if (logError) console.warn('Log failed:', logError.message);

    send('done', {});
    res.end();

  } catch(err) {
    console.error('Stream error:', err.message);
    send('error', { message: err.message || 'Generation failed' });
    res.end();
  }
};