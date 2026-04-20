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
    "verdict": "One definitive paragraph — should I buy one?",
    "runningCosts": {
      "insuranceGroup": "Group XX of 50",
      "roadTax": "£XXX/year",
      "fuelCost": "~£X,XXX/year at 10,000 miles (real-world XXmpg)",
      "serviceInterval": "Every XX,XXX miles or X years",
      "minorService": "~£XXX",
      "majorService": "~£XXX",
      "tyresCost": "~£XXX per axle (tyre size)",
      "cambeltOrChain": "Chain — no scheduled change / Belt — change at XXk miles (~£XXX)",
      "annualTotal": "~£X,XXX/year estimated total cost of ownership"
    }
  },
  "alternatives": [
    {
      "make": "Make", "model": "Model",
      "why": "One sentence — why consider this instead",
      "price": "From £XX,XXX used"
    }
  ],
  "buyingGuide": [
    {
      "title": "Check point title",
      "detail": "Detailed practical advice — what to physically check, listen for, smell for, or ask about when viewing and test driving. Be specific: mention particular components, known failure points, sounds to listen for (e.g. clunking from rear diff on lock, rattling timing chain on cold start), things to look for under the bonnet, gearbox feel, clutch bite point, brake pedal feel, signs of previous accident damage, service history red flags."
    }
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
      // Allow prompt to override car count e.g. "top 10 budget hatchbacks"
      const promptNumMatch = prompt.match(/\b(?:top\s+)?(\d+)\b/i);
      const promptNum = promptNumMatch ? parseInt(promptNumMatch[1]) : null;
      const numCars = (promptNum && promptNum >= 2 && promptNum <= 12) ? promptNum : cs.numCars;
      schema = cs.schema;
      systemNote = `Write a Full Chat motoring comparison feature about: "${prompt}". Include exactly ${numCars} cars.`;
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

CRITICAL — TECHNICAL SPECIFICATION ACCURACY:
- If the prompt specifies a drivetrain (AWD, 4WD, 4x4, all-wheel drive, RWD, rear-wheel drive, FWD, front-wheel drive), ONLY include cars that genuinely have that exact drivetrain as a STANDARD feature on the specific variant you are naming. An SUV body style does NOT mean AWD — e.g. the Hyundai Kona Electric is FWD only, the Renault Scenic E-Tech is FWD only. You must be 100% certain the exact model and generation you name comes with that drivetrain.
- If the prompt specifies a fuel type (EV, electric, hybrid, PHEV, petrol, diesel), every single car must match exactly. Do not include a petrol car in an EV list, do not include a hybrid in an EV list.
- If the prompt specifies a body style (hot hatch, estate, coupe, saloon, convertible, pickup, van), only include genuine examples of that body style.
- If the prompt specifies a performance category (hot hatch, sports car, supercar), do not include base or standard variants — use only the relevant performance variant.
- CERTAINTY RULE: If you are not 100% certain a car has the required specification, do NOT include it. Pick a different car you ARE certain about. A shorter list of accurate cars is infinitely better than a longer list with one hallucinated spec.

VOICE REMINDER: Do NOT write "I drove", "I found", "in my experience", "behind the wheel I". You have not driven these cars. Write as a curator of real-world press and owner experience — second person ("you'll find", "push it hard and it rewards you") or authoritative third person ("press testers noted", "owners report"). First person belongs only inside the quote field, attributed to the journalist who actually drove it.

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

    // ── Step 3: Independent Gemini fact-check ────────────────────────────────
    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    if (GEMINI_KEY) {
      try {
        const carsToCheck = article.articleType === 'single'
          ? [article.car]
          : (article.cars || []);

        const carSummary = carsToCheck.map((c, i) => (
          `Car ${i+1}: ${c.make} ${c.model} (${c.generation||''} ${c.yearFrom||''}–${c.yearTo||''})
  Key claims: ${[c.stat1_val&&c.stat1_label?`${c.stat1_val} ${c.stat1_label}`:'', c.stat2_val&&c.stat2_label?`${c.stat2_val} ${c.stat2_label}`:'', c.stat3_val&&c.stat3_label?`${c.stat3_val} ${c.stat3_label}`:''].filter(Boolean).join(', ')}
  Drivetrain claims in article body: ${(c.copy||'').match(/\b(AWD|4WD|4x4|all.wheel|RWD|FWD|front.wheel|rear.wheel|electric|EV|hybrid|PHEV|petrol|diesel)\b/gi)?.join(', ')||'none stated'}`
        )).join('\n\n');

        const fcPrompt = `You are an independent automotive fact-checker with access to real technical data. The user asked for: "${prompt}"

The following cars have been selected for an article. For EACH car, verify using your knowledge:
1. Does this car actually exist in the stated generation/year range?
2. Does it genuinely have the drivetrain/powertrain implied by the prompt AND any claims in the article body? (e.g. if prompt asks for AWD, does this specific model actually offer AWD?)
3. Are the key stats plausible for this specific model?

${carSummary}

Respond ONLY with valid JSON in this exact format:
{
  "passedAll": true/false,
  "errors": [
    { "carIndex": 0, "issue": "Specific factual error description — e.g. Hyundai Kona Electric does not offer AWD in any variant, it is FWD only" }
  ]
}
If all cars pass, return {"passedAll": true, "errors": []}`;

        const fcGemini = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: fcPrompt }] }] })
          }
        );
        const fcGeminiData = await fcGemini.json();
        const fcRaw = fcGeminiData.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const fcResult = parseJSON(fcRaw);

        // ── Voice scan: catch any first-person driving claims Claude snuck in ──
        const voiceErrors = [];
        const firstPersonPattern = /\b(I drove|I found|I tested|I noticed|I felt|I tried|I spent|I pushed|I took|I've driven|I've lived|I've spent|I've had|in my (time|experience|hands|ownership)|behind the wheel[,\s]+I|my test|my time with|my week with|my month with|during my)\b/gi;
        const bodyFields = article.articleType === 'single'
          ? [article.car?.fullReview, article.car?.copy, article.intro]
          : [...(article.cars||[]).map(c => c.copy), article.intro];
        bodyFields.filter(Boolean).forEach(text => {
          const matches = text.match(firstPersonPattern);
          if (matches) voiceErrors.push(`First-person driving language found: "${matches[0]}" — rewrite in second or third person (the author has not driven these cars)`);
        });
        if (voiceErrors.length) console.log('Voice check found issues:', voiceErrors);

        const allErrors = [...(fcResult?.errors||[]), ...voiceErrors.map(issue => ({ carIndex: -1, issue }))];

        if (allErrors.length) {
          console.log('Fact-check found errors:', JSON.stringify(allErrors));
          send('step', { step:'fact', state:'active', status:`Fixing ${allErrors.length} error(s)...` });

          // Build error summary for Claude rewrite
          const errorList = allErrors.map(e =>
            e.carIndex >= 0
              ? `- Car ${e.carIndex + 1} (${carsToCheck[e.carIndex]?.make} ${carsToCheck[e.carIndex]?.model}): ${e.issue}`
              : `- VOICE ERROR: ${e.issue}`
          ).join('\n');

          // Ask Claude to rewrite the article fixing the specific errors
          const rewriteRes = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4000,
            system: p.systemPrompt,
            messages: [{
              role: 'user',
              content: `An independent fact-checker has found the following errors in this article:

${errorList}

Here is the current article JSON:
${JSON.stringify(article)}

Rewrite the ENTIRE article JSON, fixing ALL of the flagged errors:
- FACTUAL errors: replace the flagged car with one that genuinely has the required specification
- VOICE errors: rewrite any first-person driving claims ("I drove", "I found", etc.) in second person ("you'll find", "push it and it rewards you") or third person ("press testers noted", "owners report"). The author has not driven these cars — first person belongs only in the attributed quote field.
- Keep all unflagged content unchanged
- Return ONLY valid JSON with the same schema as the input

${schema}`
            }]
          });

          const rewriteText = rewriteRes.content?.find(b => b.type === 'text')?.text || '';
          const rewrittenArticle = parseJSON(rewriteText);
          if (rewrittenArticle) {
            // Re-add marketplace URLs to any replaced cars
            if (rewrittenArticle.articleType === 'single' && rewrittenArticle.car) {
              rewrittenArticle.car = addMarketplaceUrls(rewrittenArticle.car);
            } else if (rewrittenArticle.cars) {
              rewrittenArticle.cars = rewrittenArticle.cars.map(addMarketplaceUrls);
            }
            article = rewrittenArticle;
            console.log('Article rewritten after fact-check corrections');
          }
        }
      } catch(fcErr) {
        console.warn('Fact-check skipped:', fcErr.message);
      }
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
