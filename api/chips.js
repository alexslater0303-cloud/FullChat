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
    return res.status(200).json({ chips: FALLBACK, source: 'fallback-no-key' });
  }

  const now = new Date();
  const weekSeed = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 604800000);
  const monthName = now.toLocaleString('en-GB', { month: 'long' });
  const year = now.getFullYear();

  const prompt = 'Generate 8 short prompt chips for a UK car article generator for ' + monthName + ' ' + year + ' (seed ' + weekSeed + '). Mix comparisons and deep dives. UK market. Prices as e.g. 15k not symbols. Return ONLY a JSON array of 8 strings, nothing else: ["chip1","chip2",...]';

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
    const dataPreview = JSON.stringify(data).slice(0, 600);
    console.log('Chips Gemini:', r.status, dataPreview);

    const raw = (((data.candidates || [])[0] || {}).content || {}).parts
      ? data.candidates[0].content.parts.map(function(p) { return p.text || ''; }).join('')
      : '';

    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) {
      return res.status(200).json({ chips: FALLBACK, source: 'fallback-error', error: 'no-array', gemini: dataPreview });
    }

    const chips = JSON.parse(match[0]);
    if (!Array.isArray(chips) || chips.length < 4) {
      return res.status(200).json({ chips: FALLBACK, source: 'fallback-error', error: 'bad-shape', gemini: dataPreview });
    }

    return res.status(200).json({ chips: chips.slice(0, 8), source: 'gemini' });
  } catch (e) {
    console.error('Chips error:', e.message);
    return res.status(200).json({ chips: FALLBACK, source: 'fallback-error', error: e.message });
  }
};
