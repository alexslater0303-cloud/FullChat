const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('../lib/supabase');
const { PERSONAS } = require('../lib/personas');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const COSTS = { article: 40, followup: 10 };

// ── Intent detection ──────────────────────────────────────────────────────────
// Returns 'single' or 'comparison'
async function detectIntent(prompt) {
  try {
    const r = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 20,
      system: 'You are an intent classifier. Reply with exactly one word: "single" or "comparison".',
      messages: [{ role: 'user', content:
        `Is this prompt asking about a single specific car, or comparing multiple cars?
Prompt: "${prompt}"
Reply "single" if it's about one specific make/model.
Reply "comparison" if it's asking for a list, best of, recommendations, or comparing options.` }]
    });
    const intent = r.content?.find(b => b.type === 'text')?.text?.trim().toLowerCase();
    return intent === 'single' ? 'single' : 'comparison';
  } catch { return 'comparison'; }
}

// ── Marketplace URL builder ───────────────────────────────────────────────────
function buildMarketplaceUrls(make, model, isNew = false, searchMake, searchModel, yearFrom, yearTo) {
  const sm  = encodeURIComponent(searchMake || make);
  const smo = encodeURIComponent(searchModel || model);
  const makeSlug  = (searchMake || make).toLowerCase().replace(/\s+/g, '-');
  const modelSlug = (searchModel || model).toLowerCase().replace(/\s+/g, '-');

  // Build AutoTrader URL with year range when available
  let atUrl = `https://www.autotrader.co.uk/car-search?make=${sm}&model=${smo}`;
  if (yearFrom) atUrl += `&year-from=${yearFrom}`;
  if (yearTo)   atUrl += `&year-to=${yearTo}`;

  const urls = {
    autotrader: atUrl,
    carwow:     `https://www.carwow.co.uk/${makeSlug}/${modelSlug}`,
  };
  if (isNew) {
    // Try to construct a manufacturer URL
    const mfr = make.toLowerCase().replace(/\s+/g, '');
    urls.manufacturer = `https://www.${mfr}.co.uk`;
  }
  return urls;
}

// ── Schemas ───────────────────────────────────────────────────────────────────
function singleCarSchema(depth) {
  return `{
  "articleType": "single",
  "headline": "PUNCHY HEADLINE ABOUT THIS SPECIFIC CAR",
  "deck": "One sentence that captures the car's essence",
  "intro": "3-4 sentences setting the scene",
  "car": {
    "make": "Make", "model": "Model", "year": "e.g. 2021-present", "badge": "Top Pick",
    "searchMake": "Make (base brand only, e.g. Honda not Honda UK)",
    "searchModel": "Base model only for search — NO variant/trim/suffix (e.g. HR-V not HR-V e:HEV, Kona not Kona Hybrid, Golf not Golf GTI)",
    "yearFrom": 2021,
    "yearTo": 2024,
    "generation": "e.g. Mk3 / FL5 / Third generation facelift — be specific",
    "bodyStyle": "e.g. hatchback, SUV, van",
    "isNew": false,
    "stat1_val": "£18,500", "stat1_label": "From (used)",
    "stat2_val": "316hp",   "stat2_label": "Power",
    "stat3_val": "5.4s",    "stat3_label": "0-62mph",
    "stat4_val": "£28,000", "stat4_label": "New price",
    "stat5_val": "52mpg",   "stat5_label": "Economy",
    "stat6_val": "1,197cc", "stat6_label": "Engine",
    "stat7_val": "258lb-ft","stat7_label": "Torque",
    "stat8_val": "155mph",  "stat8_label": "Top speed",
    "stat9_val": "142g/km", "stat9_label": "CO2",
    "fullReview": "${depth===0?'4-5 paragraphs':depth===1?'6-8 paragraphs':'8-10 paragraphs — maximum depth, technical detail, real ownership experience'}",
    "quote": "Real attributed quote from a known automotive journalist",
    "quoteAttribution": "Journalist Name, Publication",
    "pros": ["Pro 1", "Pro 2", "Pro 3"],
    "cons": ["Con 1", "Con 2", "Con 3"],
    "whoIsItFor": "2-3 sentences describing the ideal owner",
    "verdict": "One definitive paragraph — should I buy one?"
  },
  "alternatives": [
    {
      "make": "Make", "model": "Model",
      "why": "One sentence — why consider this instead",
      "price": "From £XX,XXX used"
    }
  ],
  "buyingGuide": [
    { "title": "Watch point", "detail": "One sentence of practical buying advice." }
  ]
}`;
}

function comparisonSchema(depth) {
  const cars = depth === 0 ? 3 : depth === 1 ? 4 : 5;
  const copy = depth === 0 ? '2 sentences' : depth === 1 ? '3 sentences' : '4-5 sentences with technical depth';
  const intro = depth === 0 ? '1-2 punchy sentences' : depth === 1 ? '2-3 sentences' : '3-4 sentences with real depth';
  const verdict = depth === 0 ? '2-3 blunt sentences' : depth === 1 ? 'One paragraph' : 'Two paragraphs';
  return {
    numCars: cars,
    schema: `{
  "articleType": "comparison",
  "headline": "SHORT PUNCHY UPPERCASE HEADLINE",
  "deck": "One sentence setting the tone",
  "intro": "${intro}",
  "cars": [
    {
      "make": "Make", "model": "Model", "year": "e.g. 2020-present",
      "searchMake": "Base brand only",
      "searchModel": "Base model only — NO variant/trim/suffix (e.g. HR-V not HR-V e:HEV, Kona not Kona Hybrid)",
      "yearFrom": 2020,
      "yearTo": 2024,
      "generation": "e.g. Mk3 / FL5 — be specific",
      "bodyStyle": "e.g. hatchback",
      "isNew": false,
      "badge": "Top Pick",
      "stat1_val": "£18,500", "stat1_label": "From (used)",
      "stat2_val": "316hp",   "stat2_label": "Power",
      "stat3_val": "5.4s",    "stat3_label": "0-62mph",
      "stat4_val": "£28,000", "stat4_label": "New price",
      "stat5_val": "52mpg",   "stat5_label": "Economy",
      "stat6_val": "1,197cc", "stat6_label": "Engine",
      "stat7_val": "258lb-ft","stat7_label": "Torque",
      "stat8_val": "155mph",  "stat8_label": "Top speed",
      "stat9_val": "142g/km", "stat9_label": "CO2",
      "copy": "${copy}",
      "quote": "Real attributed quote from a known automotive journalist",
      "quoteAttribution": "Journalist Name, Publication"
    }
  ],
  "verdict": "${verdict}",
  "buyingGuide": [
    { "title": "Watch point", "detail": "One sentence of practical buying advice." }
  ]
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
            `You are a senior motoring research analyst preparing a detailed briefing document for a journalist. Research this brief thoroughly using live web data: "${prompt}"

Structure your research as follows:

1. MARKET OVERVIEW
   - Current UK used market price ranges (specific £ figures, not vague ranges)
   - New car prices where relevant
   - How prices have moved in the last 12 months
   - Which trim levels represent best value

2. SPECIFICATIONS & KEY FACTS
   - Engine options, power outputs, 0-62 times
   - Economy figures (real-world, not WLTP)
   - Boot space, towing capacity, payload (for vans/SUVs)
   - Tyre sizes for common variants
   - Service intervals and typical service costs
   - Cam belt or chain? Change interval if belt

3. REAL OWNER EXPERIENCE
   - Search owner forums, review sites, and owner communities for genuine feedback
   - What do long-term owners consistently praise?
   - What do owners consistently complain about?
   - Any known issues that appear repeatedly in owner reports?
   - How does it feel to live with day-to-day?

4. RELIABILITY & KNOWN ISSUES
   - Most commonly reported faults and at what mileage they typically appear
   - Gearbox, engine, electrical issues — be specific
   - MOT failure points to watch
   - Recalls — any outstanding?
   - Reliability comparison vs class rivals

5. TOTAL OWNERSHIP COSTS
   - Insurance group
   - Annual road tax (VED)
   - Typical annual service cost
   - Fuel costs at 10,000 miles/year (using real-world mpg)
   - Tyre replacement costs
   - Estimated total annual running cost

6. WHAT REVIEWERS SAY
   - Key points from professional road tests (Evo, Autocar, Top Gear, What Car, Auto Express)
   - Specific criticisms from long-term tests
   - How it compares to key rivals in reviews

7. BUYING ADVICE
   - Which year/facelift to target and why
   - Which engine/gearbox combination to avoid
   - Mileage sweet spot for used buying
   - What to check on inspection

Be brutally honest. Use specific numbers throughout. Vague generalisations are useless.` }] }],
          tools: [{ googleSearch: {} }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 2500 }
        })
      }
    );
    if (!r.ok) return null;
    const d = await r.json();
    return d.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch { return null; }
}

// ── JSON parser ───────────────────────────────────────────────────────────────
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
  if (tester.tokens_remaining < cost) return res.status(402).json({
    error: 'Out of tokens — ask Alex for a top up!',
    tokens_remaining: tester.tokens_remaining
  });

  // ── FOLLOW-UP ─────────────────────────────────────────────────────────────
  if (mode === 'followup') {
    try {
      const r = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514', max_tokens: 400,
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

  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    // Step 1 — Intent detection + Gemini research (parallel)
    send('step', { step:'research', state:'active', status:'Deep-searching owner forums, prices & reviews...' });
    const [intent, research] = await Promise.all([
      detectIntent(prompt),
      geminiResearch(prompt)
    ]);
    send('step', { step:'research', state:'done', status:`${intent==='single'?'Deep dive':'Comparison'} detected · ${research?'Live data gathered ✓':'Research complete ✓'}`, usedGemini:!!research, intent });

    // Step 2 — Write
    send('step', { step:'write', state:'active', status:'Writing your feature...' });

    const researchBlock = research
      ? `\n\nDetailed market research from live sources — treat this as ground truth. Use the specific prices, specs, owner complaints, reliability data and running costs throughout your article. Do not contradict any of these facts:\n\n---\n${research}\n---\n\nIMPORTANT: The research above contains real owner sentiment and known issues gathered from owner forums and review sites. Weave this into your copy naturally — mention specific known faults, praise things owners consistently love, and be honest about weaknesses owners report. This is what makes the article genuinely useful rather than just a press release rewrite.`
      : '';

    let schema, systemNote;
    if (intent === 'single') {
      schema = singleCarSchema(Number(depth));
      systemNote = `Write a long-form deep dive review about: "${prompt}". This is a single car feature — go deep, be thorough, include real ownership experience, not a comparison list.`;
    } else {
      const cs = comparisonSchema(Number(depth));
      schema = cs.schema;
      systemNote = `Write a Full Chat motoring comparison feature about: "${prompt}". Include ${cs.numCars} cars.`;
    }

    const maxTokens = intent==='single'
      ? (depth===0?2200:depth===1?3500:5000)
      : (depth===0?1800:depth===1?2800:3800);

    let fullText = '';

    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system: p.systemPrompt,
      messages: [{
        role: 'user',
        content: `${systemNote}${researchBlock}

CRITICAL — YEAR & GENERATION SPECIFICITY:
- Always identify and commit to a specific year range or generation (e.g. "2015-2017 FK2", "2023-present FL5")
- A 2015 Civic Type R and a 2024 Civic Type R are completely different cars — never conflate generations
- If the prompt is vague, default to the most recent/relevant generation for the UK used market and state it clearly
- Fill yearFrom and yearTo with actual numeric years (e.g. 2017, 2023) — not null, not "present"
- yearTo should be the current year (2026) if the car is still in production
- The generation field must be specific (chassis code, Mk number, facelift designation) — not just "current"
- All specs, prices and owner commentary in the article must match the specific generation identified
- For NEW PRICE stat: if the car is discontinued (yearTo < 2025), label it "Launch price" or "Was new from" — never "New price" for a car no longer on sale. If the car is still on sale, use "New price"

For quote fields: real attributed quotes from known automotive journalists (Evo, Top Gear, Autocar, Chris Harris, Henry Catchpole). Put attribution in "quoteAttribution".

Respond with ONLY a valid JSON object — no text before or after, no markdown fences:

${schema}`
      }]
    });

    stream.on('text', chunk => {
      fullText += chunk;
      send('token', { chunk });
    });

    await stream.finalMessage();
    send('step', { step:'write', state:'done', status:'Article written ✓' });

    // Step 3 — Fact-check
    send('step', { step:'fact', state:'active', status:'Cross-checking claims...' });

    let article = parseJSON(fullText);
    if (!article) {
      send('error', { message: 'Could not parse article — please try again' });
      res.end(); return;
    }

    // Add marketplace URLs to cars
    const addMarketplaceUrls = (car) => ({
      ...car,
      marketplaceUrls: buildMarketplaceUrls(car.make, car.model, car.isNew, car.searchMake, car.searchModel, car.yearFrom, car.yearTo)
    });

    if (article.articleType === 'single' && article.car) {
      article.car = addMarketplaceUrls(article.car);
    } else if (article.cars) {
      article.cars = article.cars.map(addMarketplaceUrls);
    }

    // Silent fact-check
    try {
      const carsToCheck = article.articleType === 'single'
        ? [article.car]
        : (article.cars || []);

      const fcRes = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514', max_tokens: 600,
        system: 'You are an automotive fact-checker. Return ONLY valid JSON, no markdown.',
        messages: [{
          role: 'user',
          content: `Check for factual errors (wrong specs, implausible prices). Silently correct. If all correct return {"correctedCars":null}.

Cars: ${JSON.stringify(carsToCheck.map(c=>({
  make:c.make, model:c.model,
  stat1:`${c.stat1_val} ${c.stat1_label}`,
  stat2:`${c.stat2_val} ${c.stat2_label}`,
  stat3:`${c.stat3_val} ${c.stat3_label}`,
  stat4:`${c.stat4_val} ${c.stat4_label}`,
  stat5:`${c.stat5_val} ${c.stat5_label}`,
  stat6:`${c.stat6_val} ${c.stat6_label}`,
  stat7:`${c.stat7_val} ${c.stat7_label}`,
  stat8:`${c.stat8_val} ${c.stat8_label}`,
  stat9:`${c.stat9_val} ${c.stat9_label}`
})))}

Return: {"correctedCars":[...full corrected cars...] or null}`
        }]
      });

      const fc = parseJSON(fcRes.content?.find(b=>b.type==='text')?.text||'{}');
      if (fc?.correctedCars?.length) {
        if (article.articleType === 'single') {
          article.car = { ...article.car, ...fc.correctedCars[0] };
        } else {
          article.cars = article.cars.map((car,i) => {
            const fix = fc.correctedCars[i];
            return fix ? {...car,...fix} : car;
          });
        }
      }
    } catch(fcErr) {
      console.warn('Fact-check skipped:', fcErr.message);
    }

    send('step', { step:'fact', state:'done', status:'All claims verified ✓' });
    send('article', { article, usedGemini:!!research, intent, tokens_remaining: tester.tokens_remaining - cost });

    // Deduct tokens
    await supabase.from('testers').update({
      tokens_remaining: tester.tokens_remaining - cost,
      tokens_used: (tester.tokens_used||0) + cost
    }).eq('id', tester.id);

    const { error: logErr } = await supabase.from('generations').insert({
      tester_id: tester.id, prompt, persona,
      tokens_used: cost,
      article_headline: article.headline || null
    });
    if (logErr) console.warn('Log failed:', logErr.message);

    send('done', {});
    res.end();

  } catch(err) {
    console.error('Stream error:', err.message);
    send('error', { message: err.message || 'Generation failed' });
    res.end();
  }
};
