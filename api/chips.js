module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const FALLBACK = [
    'Best hot hatches under £15k',
    'Best used sports cars under £20k',
    'AWD EVs under £20k',
    'Japanese performance cars under £30k',
    'Deep dive on the Honda Civic Type R',
    'Deep dive on the Toyota GR86',
  ];

  const KEY = process.env.GEMINI_API_KEY;
  if (!KEY) return res.status(200).json({ chips: FALLBACK });

  // Seed variation by week number so chips rotate weekly but are stable within a session
  const now = new Date();
  const weekSeed = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 604800000);
  const monthName = now.toLocaleString('en-GB', { month: 'long' });
  const year = now.getFullYear();

  const prompt = `You are a motoring journalist generating punchy prompt ideas for a car article generator aimed at UK enthusiasts.

Generate exactly 8 varied prompt chips for ${monthName} ${year} (seed: week ${weekSeed}). Each chip is a short, specific, enticing article brief — a mix of comparisons and deep dives.

Rules:
- Mix price brackets: some budget (under £15k), some mid-range (£15k–£40k), some aspirational (£40k+)
- Mix categories: hot hatches, sports cars, EVs, SUVs, sleeper/bargain picks, JDM, classics
- Mix formats: some comparisons ("Best X under £Yk"), some deep dives ("Deep dive on the [Car]")
- All cars must be genuinely relevant to UK buyers
- Be specific — name real cars or real budget brackets
- Keep each chip under 8 words
- Vary the list so it feels fresh and different to the previous week

Respond with ONLY a JSON array of 8 strings. No markdown, no explanation:
["chip 1", "chip 2", ...]`;

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 1.1, maxOutputTokens: 512 },
        }),
      }
    );
    const data = await r.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    // Strip markdown fences if present
    const clean = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    const chips = JSON.parse(clean);
    if (!Array.isArray(chips) || chips.length < 4) throw new Error('Bad response shape');
    return res.status(200).json({ chips: chips.slice(0, 8) });
  } catch (e) {
    console.error('Chips fetch error:', e.message);
    return res.status(200).json({ chips: FALLBACK });
  }
};
