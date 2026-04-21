module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const FALLBACK = [
    'Best hot hatches under 15k',
    'Best used sports cars under 20k',
    'AWD EVs under 20k',
    'Japanese performance cars under 30k',
    'Deep dive on the Honda Civic Type R',
    'Deep dive on the Toyota GR86',
  ];

  const KEY = process.env.GEMINI_API_KEY;
  if (!KEY) {
    console.log('Chips: no GEMINI_API_KEY, using fallback');
    return res.status(200).json({ chips: FALLBACK, source: 'fallback-no-key' });
  }

  const now = new Date();
  const weekSeed = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 604800000);
  const monthName = now.toLocaleString('en-GB', { month: 'long' });
  const year = now.getFullYear();

  const prompt = `You are a motoring journalist. Generate 8 short prompt chips for a UK car article generator.

Date: ${monthName} ${year}, week ${weekSeed}.

Mix of: comparisons (e.g. "Best hot hatches under 15k"), deep dives (e.g. "Deep dive on the Golf R"), EVs, sports cars, budget picks, classics, JDM.
Keep each under 8 words. UK market focus. Write prices as e.g. "15k" or "20k" with no currency symbols.

Return ONLY a JSON array of 8 strings, nothing else. Example:
["Best hot hatches under 15k","Deep dive on the Civic Type R","Top AWD EVs for 2025","Best sleeper saloons under 10k","Deep dive on the Toyota GR86","Best estate cars under 20k","Top JDM picks for UK roads","Best SUVs under 30k"]`;

  try {
    const r = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + KEY,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.9, maxOutputTokens: 256 },
        }),
      }
    );
    const data = await r.json();
    console.log('Chips Gemini status:', r.status, JSON.stringify(data).slice(0, 300));

    const raw = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] ? data.candidates[0].content.parts[0].text : '';
    console.log('Chips raw:', raw.slice(0, 300));

    // Match the largest [...] block — handles prose before/after the array
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('No JSON array found in response: ' + raw.slice(0, 200));

    const chips = JSON.parse(match[0]);
    if (!Array.isArray(chips) || chips.length < 4) throw new Error('Bad shape');

    console.log('Chips success:', chips.length);
    return res.status(200).json({ chips: chips.slice(0, 8), source: 'gemini' });
  } catch (e) {
    console.error('Chips error:', e.message);
    return res.status(200).json({ chips: FALLBACK, source: 'fallback-error', error: e.message });
  }
};
