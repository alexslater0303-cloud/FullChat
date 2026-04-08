const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('../lib/supabase');
const { PERSONAS } = require('../lib/personas');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const GENERATION_COST = 40;
const FOLLOWUP_COST   = 10;

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
      "stat3_val": "5.4s",    "stat3_label": "0-62mph",
      "copy": "${copyLen}",
      "quote": "Real attributed quote from known automotive journalist about this specific car",
      "quoteAttribution": "Journalist Name, Publication"
    }
  ],
  "verdict": "${verdict}",
  "buyingGuide": [{"title":"Watch point","detail":"One sentence practical advice."}]
}` };
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, persona, depth = 1, inviteCode, mode = 'article', context, history = [] } = req.body || {};

  if (!prompt || !persona || !inviteCode) {
    return res.status(400).json({ error: 'prompt, persona and inviteCode required' });
  }
  if (!PERSONAS[persona]) {
    return res.status(400).json({ error: 'Invalid persona' });
  }

  const normCode = inviteCode.trim().toUpperCase();
  const cost     = mode === 'followup' ? FOLLOWUP_COST : GENERATION_COST;

  // Check tokens
  const { data: tester, error: tErr } = await supabase
    .from('testers').select('id, tokens_remaining, tokens_used').eq('invite_code', normCode).eq('active', true).single();

  if (tErr || !tester) return res.status(403).json({ error: 'Invalid or inactive invite code' });
  if (tester.tokens_remaining < cost) return res.status(402).json({ error: 'Insufficient tokens', tokens_remaining: tester.tokens_remaining });

  const p = PERSONAS[persona];

  try {
    // ── FOLLOW-UP MODE ──────────────────────────────────────────────────────
    if (mode === 'followup') {
      const msgs = [...history.map(m => ({ role: m.role, content: m.content })), { role: 'user', content: prompt }];
      const r = await client.messages.create({
        model: 'claude-sonnet-4-20250514', max_tokens: 400,
        system: p.systemPrompt + '\n\n' + (context || ''),
        messages: msgs
      });
      const answer = r.content?.find(b => b.type === 'text')?.text || 'Try again.';
      await supabase.from('testers').update({ tokens_remaining: tester.tokens_remaining - cost, tokens_used: tester.tokens_used + cost }).eq('id', tester.id);
      return res.status(200).json({ answer, tokens_remaining: tester.tokens_remaining - cost });
    }

    // ── ARTICLE MODE ────────────────────────────────────────────────────────
    const { numCars, schema } = makeSchema(depth);
    const maxTokens = depth === 0 ? 1800 : depth === 1 ? 2800 : 3800;

    const writeRes = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system: p.systemPrompt,
      messages: [{
        role: 'user',
        content: `Write a Full Chat motoring feature about: "${prompt}"

Use accurate real-world UK used market prices and genuine specs. Write in your distinct persona voice throughout. Include ${numCars} cars.

For each car's "quote" field: use a real attributed quote from a known automotive journalist or publication (Evo, Top Gear, Autocar, Chris Harris, Henry Catchpole etc) about that specific car. Put attribution in "quoteAttribution". Use real quotes from your training data; if uncertain, write a plausible quote with realistic attribution.

Respond with ONLY a valid JSON object — no text before or after, no markdown fences:

${schema}`
      }]
    });

    const raw = (writeRes.content?.find(b => b.type === 'text')?.text || '')
      .replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let article;
    try { article = JSON.parse(raw); }
    catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) { try { article = JSON.parse(m[0]); } catch {} }
      if (!article) return res.status(500).json({ error: 'Could not parse article — try again', raw: raw.slice(0, 200) });
    }

    // ── SILENT FACT-CHECK ───────────────────────────────────────────────────
    try {
      const fcRes = await client.messages.create({
        model: 'claude-sonnet-4-20250514', max_tokens: 800,
        system: 'You are a rigorous automotive fact-checker. Return ONLY valid JSON, no markdown.',
        messages: [{
          role: 'user',
          content: `Silently fact-check and correct any errors in this article. Fix wrong specs, implausible prices. If all correct, return null for correctedArticle.

${JSON.stringify({ cars: article.cars?.map(c => ({ make: c.make, model: c.model, stat1_val: c.stat1_val, stat1_label: c.stat1_label, stat2_val: c.stat2_val, stat2_label: c.stat2_label, stat3_val: c.stat3_val, stat3_label: c.stat3_label })) })}

Return: {"correctedArticle":{"cars":[...corrected cars with same full structure...]} or null}`
        }]
      });
      const fcRaw = (fcRes.content?.find(b => b.type === 'text')?.text || '{}').replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
      const fc = JSON.parse(fcRaw);
      if (fc.correctedArticle?.cars) article = { ...article, cars: fc.correctedArticle.cars };
    } catch {} // Fact-check is non-fatal

    // ── LOG & DEDUCT (non-fatal) ────────────────────────────────────────────
    try {
      await supabase.from('testers').update({
        tokens_remaining: tester.tokens_remaining - cost,
        tokens_used: (tester.tokens_used || 0) + cost
      }).eq('id', tester.id);

      await supabase.from('generations').insert({
        tester_id: tester.id, prompt, persona,
        tokens_used: cost, article_headline: article.headline || null
      });
    } catch (logErr) {
      console.warn('Token logging failed (non-fatal):', logErr.message);
    }

    return res.status(200).json({
      article,
      tokens_remaining: tester.tokens_remaining - cost
    });

  } catch (err) {
    console.error('Generation error:', err);
    return res.status(500).json({ error: 'Generation failed', detail: err.message });
  }
};
