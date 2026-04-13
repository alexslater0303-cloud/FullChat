const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('../lib/supabase');
const { PERSONAS } = require('../lib/personas');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const COSTS = { article: 40, followup: 10 };

function makeSchema(depth, requestedCount) {
  const cars = requestedCount || (depth === 0 ? 2 : depth === 1 ? 3 : 4);
  const isDeepDive = cars === 1;
  const copy = isDeepDive 
    ? '8-10 sentences with high technical depth, common faults, and driving dynamics' 
    : (depth === 0 ? '2 sentences' : depth === 1 ? '3 sentences' : '4-5 sentences with technical depth');
  
  return {
    numCars: cars,
    maxTokens: depth === 0 ? 1800 : depth === 1 ? 2800 : 3800,
    schema: `{
  "headline": "STR",
  "deck": "STR",
  "intro": "STR",
  "cars": [
    {
      "make": "Make", "model": "Model", "badge": "${isDeepDive ? 'The Focus' : 'Top Pick'}",
      "stat1_val": "Val", "stat1_label": "Label",
      "stat2_val": "Val", "stat2_label": "Label",
      "stat3_val": "Val", "stat3_label": "Label",
      "copy": "${copy}",
      "quote": "Quote",
      "quoteAttribution": "Name"
    }
  ],
  "verdict": "Verdict",
  "buyingGuide": [{ "title": "Tip", "detail": "Detail" }]
}`
  };
}

async function geminiResearch(prompt) {
  const KEY = process.env.GEMINI_API_KEY;
  if (!KEY) return null;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Research this UK car brief: "${prompt}"` }] }],
        tools: [{ googleSearch: {} }]
      })
    });
    const d = await r.json();
    return d.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (e) { return null; }
}

function parseJSON(raw) {
  const c = raw.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
  try { return JSON.parse(c); } catch (e) {}
  const m = c.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (e) {} }
  return null;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const { prompt, persona, depth=1, inviteCode } = req.body || {};
  if (!prompt || !persona || !inviteCode) return res.status(400).json({ error: 'Missing fields' });

  const normCode = inviteCode.trim().toUpperCase();
  const p = PERSONAS[persona];

  const { data: tester } = await supabase.from('testers').select('*').eq('invite_code', normCode).eq('active', true).single();
  if (!tester) return res.status(403).json({ error: 'Invalid code' });

  // STREAM HEADERS
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform'); // no-transform prevents Vercel/Cloudflare from buffering
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Critical for stopping "hangs" on some hosts
  res.flushHeaders();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (res.flush) res.flush(); // Force the data out of the buffer
  };

  try {
    send('step', { step: 'research', state: 'active', status: 'Gathering data...' });
    const research = await geminiResearch(prompt);
    send('step', { step: 'research', state: 'done' });

    send('step', { step: 'write', state: 'active', status: 'Writing article...' });

    let requestedCount = (prompt.toLowerCase().includes('deep dive') || prompt.toLowerCase().includes('single car')) ? 1 : null;
    const { numCars, maxTokens, schema } = makeSchema(Number(depth), requestedCount);

    let fullText = '';
    const stream = anthropic.messages.stream({
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: maxTokens,
      system: p.systemPrompt,
      messages: [{ role: 'user', content: `Write about: "${prompt}". ${research ? 'Research: ' + research : ''} Include ${numCars} car(s). JSON ONLY: ${schema}` }]
    })
    .on('text', (text) => {
      fullText += text;
      send('token', { chunk: text }); // This is what shows the text at the bottom
    });

    await stream.finalMessage();
    send('step', { step: 'write', state: 'done' });

    const article = parseJSON(fullText);
    if (article) {
      send('article', { article, usedGemini: !!research });
      
      // Background DB updates
      supabase.from('testers').update({
        tokens_remaining: tester.tokens_remaining - 40,
        tokens_used: (tester.tokens_used || 0) + 40
      }).eq('id', tester.id).then(() => {});

      supabase.from('generations').insert({
        tester_id: tester.id, prompt, persona, tokens_used: 40, article_headline: article.headline
      }).then(() => {});
    }

    send('done', {});
    res.end();

  } catch(err) {
    console.error(err);
    res.end();
  }
};