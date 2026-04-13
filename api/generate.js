const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('../lib/supabase');
const { PERSONAS } = require('../lib/personas');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const { prompt, persona, depth=1, inviteCode } = req.body || {};
  const p = PERSONAS[persona];

  // 1. Simple Auth Check
  const { data: tester, error: authError } = await supabase
    .from('testers')
    .select('*')
    .eq('invite_code', inviteCode?.trim().toUpperCase())
    .single();

  if (authError || !tester) return res.status(403).json({ error: 'Check your invite code' });

  // 2. Setup Stream Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    // Detect deep dive count
    const numCars = (prompt.toLowerCase().includes('deep dive') || prompt.toLowerCase().includes('single car')) ? 1 : (depth == 0 ? 2 : 3);

    // 3. Start Claude Stream
    const stream = anthropic.messages.stream({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 2500,
      system: p.systemPrompt,
      messages: [{ 
        role: 'user', 
        content: `Write a car article about "${prompt}". Focus on ${numCars} car(s). Return ONLY a JSON object with keys: headline, deck, intro, cars (array with make, model, badge, stat1_val, stat1_label, stat2_val, stat2_label, stat3_val, stat3_label, copy, quote, quoteAttribution), verdict, buyingGuide.` 
      }]
    });

    let fullText = '';
    stream.on('text', (chunk) => {
      fullText += chunk;
      send('token', { chunk });
    });

    await stream.finalMessage();
    
    // 4. Parse and Send Article
    const cleanJson = fullText.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
    const article = JSON.parse(cleanJson);

    send('article', { article });

    // 5. Background DB Update (Don't await this to keep stream fast)
    supabase.from('testers').update({
      tokens_remaining: tester.tokens_remaining - 40,
      tokens_used: (tester.tokens_used || 0) + 40
    }).eq('id', tester.id).then(({error}) => {
       if (error) console.error('DB Update Error:', error.message);
    });

    send('done', {});
    res.end();

  } catch (err) {
    console.error('CLAUDE ERROR:', err.message);
    // If it fails here, the error will appear in your Vercel Dashboard Logs
    res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
    res.end();
  }
};